import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import {
  createDynamoDeliveryStore,
  type DeliveryRecord,
} from '../../packages/runtime/src/editorial/delivery-ledger.js';

const record: DeliveryRecord = {
  pk: 'notify#abc#def',
  version: 'v2',
  status: 'sent',
  uncertain: false,
  generation: 1,
  firstAttemptAt: 10,
  leaseUntil: 20,
  updatedAt: 30,
  post: '/blog/post',
  providerId: 'email_1',
};

describe('registro de envíos en DynamoDB', () => {
  it('escribe condicionado por versión, sin TTL, y relee consistente', async () => {
    let item: unknown;
    const send = vi.fn(async (command: object) => {
      if (command instanceof PutItemCommand) item = command.input.Item;
      return { Item: item };
    });
    const store = createDynamoDeliveryStore({ send } as never, 'control');
    expect(await store.put(record, null)).toBe(true);
    expect(await store.put(record, 'v1')).toBe(true);
    const [create, update] = send.mock.calls.map(([command]) => (command as PutItemCommand).input);
    expect(create!.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect(update!.ConditionExpression).toBe('#version = :previous');
    expect(update!.ExpressionAttributeValues).toEqual({ ':previous': { S: 'v1' } });
    expect(create!.Item).not.toHaveProperty('ttl');
    expect(await store.get(record.pk)).toEqual(record);
    expect((send.mock.calls[2]![0] as GetItemCommand).input.ConsistentRead).toBe(true);
  });

  it('un conflicto devuelve false y otro fallo se propaga', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' }),
      )
      .mockRejectedValueOnce(new Error('throttled'));
    const store = createDynamoDeliveryStore({ send } as never, 'control');
    expect(await store.put(record, 'v1')).toBe(false);
    await expect(store.put(record, 'v1')).rejects.toThrow('throttled');
  });

  it('un registro ilegible falla en lugar de considerarse inexistente', async () => {
    const send = vi.fn(async () => ({ Item: { pk: { S: record.pk }, status: { S: 'otro' } } }));
    await expect(
      createDynamoDeliveryStore({ send } as never, 'control').get(record.pk),
    ).rejects.toThrow('Invalid delivery record');
  });
});

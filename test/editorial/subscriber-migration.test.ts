import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type AnyMock = Mock<(...args: any[]) => any>;
import { migrateSubscribers } from '../../packages/runtime/dev/subscriber-migration.js';

const key = 'subscribers/audit@example.com.json';
const body = Buffer.from(JSON.stringify({ email: 'audit@example.com', createdAt: '2026-10-09' }));
const response = (value: Buffer) => ({ Body: { transformToByteArray: async () => value } });
let send: AnyMock;
const commands = () => send.mock.calls.map(([command]) => command);

beforeEach(() => {
  send = vi.fn();
});

describe('migración privada de suscriptores (dev)', () => {
  it('plan solo lista, sin leer datos ni escribir', async () => {
    send.mockResolvedValue({ Contents: [{ Key: key }] });
    expect(await migrateSubscribers({ send }, 'public', 'private', 'plan')).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(commands()[0]).toBeInstanceOf(ListObjectsV2Command);
  });

  it('copia y verifica el contenido sin borrar la fuente', async () => {
    send
      .mockResolvedValueOnce({ Contents: [{ Key: key }] })
      .mockResolvedValueOnce(response(body))
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NoSuchKey' }))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(response(body));
    expect(await migrateSubscribers({ send }, 'public', 'private', 'copy')).toBe(1);
    const put = commands().find((command) => command instanceof PutObjectCommand);
    expect(put?.input).toMatchObject({ Bucket: 'private', Key: key, IfNoneMatch: '*', Body: body });
    expect(commands().some((command) => command instanceof DeleteObjectCommand)).toBe(false);
  });

  it('no borra ni sobrescribe una copia diferente', async () => {
    send
      .mockResolvedValueOnce({ Contents: [{ Key: key }] })
      .mockResolvedValueOnce(response(body))
      .mockResolvedValueOnce(response(Buffer.from('different')));
    await expect(
      migrateSubscribers({ send }, 'public', 'private', 'remove-public'),
    ).rejects.toThrow('differs');
    expect(
      commands().every(
        (command) => command instanceof GetObjectCommand || command instanceof ListObjectsV2Command,
      ),
    ).toBe(true);
  });

  it('retira la copia pública solo después de verificar destino y releer la fuente', async () => {
    send
      .mockResolvedValueOnce({ Contents: [{ Key: key }] })
      .mockResolvedValueOnce(response(body))
      .mockResolvedValueOnce(response(body))
      .mockResolvedValueOnce(response(body))
      .mockResolvedValueOnce({});
    expect(await migrateSubscribers({ send }, 'public', 'private', 'remove-public')).toBe(1);
    const last = commands().at(-1) as DeleteObjectCommand;
    expect(last).toBeInstanceOf(DeleteObjectCommand);
    expect(last.input).toEqual({ Bucket: 'public', Key: key });
  });

  it('detiene el borrado cuando cambia la fuente', async () => {
    send
      .mockResolvedValueOnce({ Contents: [{ Key: key }] })
      .mockResolvedValueOnce(response(body))
      .mockResolvedValueOnce(response(body))
      .mockResolvedValueOnce(response(Buffer.from('changed')));
    await expect(
      migrateSubscribers({ send }, 'public', 'private', 'remove-public'),
    ).rejects.toThrow('changed');
    expect(commands().some((command) => command instanceof DeleteObjectCommand)).toBe(false);
  });

  it('rechaza un destino igual al bucket público', async () => {
    await expect(migrateSubscribers({ send }, 'public', 'public', 'copy')).rejects.toThrow(
      'Distinct',
    );
    expect(send).not.toHaveBeenCalled();
  });
});

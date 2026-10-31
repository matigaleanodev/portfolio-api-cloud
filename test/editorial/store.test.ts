import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type AnyMock = Mock<(...args: any[]) => any>;
import {
  assertPrivateSubscribersBucket,
  buildSubscriberKey,
  createSubscriberStore,
  isValidSubscriberEmail,
  normalizeSubscriberEmail,
} from '../../packages/runtime/src/subscriptions/store.js';

const config = {
  endpoint: 'https://r2.example.invalid',
  bucket: 'test-bucket',
  accessKeyId: 'id',
  secretAccessKey: 'secret',
};
const notFound = () => Object.assign(new Error('missing'), { name: 'NotFound' });
let send: AnyMock;

beforeEach(() => {
  send = vi.fn();
});

describe('store de suscriptores', () => {
  it('normaliza emails y arma claves heredadas', () => {
    expect(normalizeSubscriberEmail(' USER@Example.com ')).toBe('user@example.com');
    expect(buildSubscriberKey(' USER@example.com ')).toBe('subscribers/user@example.com.json');
    expect(isValidSubscriberEmail('user@example.com')).toBe(true);
    expect(isValidSubscriberEmail('invalid')).toBe(false);
  });

  it('rechaza el bucket público como bucket de suscriptores', () => {
    expect(() => assertPrivateSubscribersBucket('media', 'media')).toThrow('must differ');
    expect(() => assertPrivateSubscribersBucket('subscribers', 'media')).not.toThrow();
  });

  it.each(['test%tag@example.com', 'test%2Btag@example.com'])(
    'conserva los porcentajes del email al normalizar y escribir: %s',
    async (email) => {
      send.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({});
      await createSubscriberStore(config, { send }).createSubscriber(email);
      const command = send.mock.calls[1]?.[0] as PutObjectCommand;
      expect(command.input.Bucket).toBe('test-bucket');
      expect(command.input.Key).toBe(`subscribers/${email.toLowerCase()}.json`);
      expect(JSON.parse(String(command.input.Body)).email).toBe(email.toLowerCase());
    },
  );

  it('crea el objeto con HEAD + PUT cuando no existe', async () => {
    send.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({});
    expect(await createSubscriberStore(config, { send }).createSubscriber('User@example.com')).toBe(
      'created',
    );
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[0]?.[0].input).toEqual({
      Bucket: 'test-bucket',
      Key: 'subscribers/user@example.com.json',
    });
    const put = send.mock.calls[1]?.[0] as PutObjectCommand;
    expect(put.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'subscribers/user@example.com.json',
      ContentType: 'application/json',
    });
    const body = JSON.parse(String(put.input.Body));
    expect(body).toEqual({ email: 'user@example.com', createdAt: expect.any(String) });
    expect(String(put.input.Body)).toBe(JSON.stringify(body, null, 2));
  });

  it('devuelve exists sin escribir', async () => {
    send.mockResolvedValueOnce({});
    expect(await createSubscriberStore(config, { send }).createSubscriber('user@example.com')).toBe(
      'exists',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('borra con HEAD + DELETE cuando existe y devuelve missing si no', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const store = createSubscriberStore(config, { send });
    expect(await store.deleteSubscriber('user@example.com')).toBe('deleted');
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    send.mockRejectedValueOnce(notFound());
    expect(await store.deleteSubscriber('user@example.com')).toBe('missing');
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('propaga errores distintos de NotFound/NoSuchKey', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await expect(
      createSubscriberStore(config, { send }).createSubscriber('user@example.com'),
    ).rejects.toThrow('denied');
  });

  it('lista emails paginando y deduplicando', async () => {
    send
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'subscribers/one@example.com.json' },
          { Key: 'subscribers/two@example.com.json' },
          { Key: 'subscribers/' },
          { Key: 'subscribers/x.txt' },
        ],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'subscribers/two@example.com.json' }],
        IsTruncated: false,
      });
    expect(await createSubscriberStore(config, { send }).listSubscriberEmails()).toEqual([
      'one@example.com',
      'two@example.com',
    ]);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectsV2Command);
    expect(send.mock.calls[1]?.[0].input).toMatchObject({
      Bucket: 'test-bucket',
      Prefix: 'subscribers/',
      ContinuationToken: 'page-2',
    });
  });

  it('pasa el AbortSignal a cada operación', async () => {
    const signal = new AbortController().signal;
    send.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({});
    await createSubscriberStore(config, { send }).createSubscriber('a@example.com', signal);
    expect(send.mock.calls.map(([, options]) => options)).toEqual([
      { abortSignal: signal },
      { abortSignal: signal },
    ]);
  });

  it('crea el cliente R2 recién en la primera operación, con la configuración recibida', async () => {
    const real = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({ Contents: [] } as never);
    const store = createSubscriberStore(config);
    expect(real).not.toHaveBeenCalled();
    await store.listSubscriberEmails();
    expect(real).toHaveBeenCalledTimes(1);
    const client = real.mock.contexts[0] as S3Client;
    expect(await client.config.region()).toBe('auto');
    expect(await client.config.credentials()).toMatchObject({
      accessKeyId: 'id',
      secretAccessKey: 'secret',
    });
  });
});

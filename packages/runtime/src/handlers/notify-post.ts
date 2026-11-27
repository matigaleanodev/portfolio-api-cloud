import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { Context } from 'aws-lambda';
import type { LambdaResponse, NotifyPostEvent } from '@portfolio-api-cloud/contracts/editorial';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { assertPrivateSubscribersBucket, createSubscriberStore } from '../subscriptions/store.js';
import { readNotifyPostConfig } from '../editorial/config.js';
import {
  createDeliveryLedger,
  createDynamoDeliveryStore,
  ledgerRequestTimeoutMs,
} from '../editorial/delivery-ledger.js';
import { createBlogNotifier } from '../editorial/email.js';
import { notifyPost } from '../editorial/notify-post.js';
import { createSensitiveConfiguration, memoizeBySnapshot } from '../editorial/runtime.js';

const dependencies = memoizeBySnapshot(
  createSensitiveConfiguration(functions.notifyPost),
  (sensitive) => {
    const config = readNotifyPostConfig(process.env);
    assertPrivateSubscribersBucket(config.subscribers.bucket, config.publicBucket);
    const store = createSubscriberStore({
      ...config.subscribers,
      accessKeyId: sensitive.R2_SUBSCRIBERS_ACCESS_KEY_ID!,
      secretAccessKey: sensitive.R2_SUBSCRIBERS_SECRET_ACCESS_KEY!,
    });
    return {
      listSubscriberEmails: () => store.listSubscriberEmails(),
      unsubscribeId: (email: string) => store.ensureUnsubscribeId(email),
      ledger: createDeliveryLedger(
        createDynamoDeliveryStore(
          new DynamoDBClient({
            maxAttempts: 1,
            requestHandler: {
              connectionTimeout: 2_000,
              requestTimeout: ledgerRequestTimeoutMs,
              socketTimeout: ledgerRequestTimeoutMs,
              throwOnRequestTimeout: true,
            },
          }),
          config.ledgerTable,
        ),
        sensitive.NOTIFY_LEDGER_KEY!,
      ),
      notify: createBlogNotifier({
        apiKey: sensitive.RESEND_BLOG_API_KEY!,
        fromEmail: config.fromEmail,
      }),
    };
  },
);

export const handler = async (
  event: NotifyPostEvent,
  context: Pick<Context, 'getRemainingTimeInMillis'>,
): Promise<LambdaResponse> =>
  notifyPost(event, dependencies, { remainingMs: () => context.getRemainingTimeInMillis() });

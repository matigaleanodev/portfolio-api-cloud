import type { LambdaResponse, NotifyPostEvent } from '@portfolio-api-cloud/contracts/editorial';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { assertPrivateSubscribersBucket, createSubscriberStore } from '../subscriptions/store.js';
import { readNotifyPostConfig } from '../editorial/config.js';
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
      notify: createBlogNotifier({
        apiKey: sensitive.RESEND_BLOG_API_KEY!,
        fromEmail: config.fromEmail,
      }),
    };
  },
);

export const handler = async (event: NotifyPostEvent): Promise<LambdaResponse> =>
  notifyPost(event, dependencies);

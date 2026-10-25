import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createApplication } from './application.js';
import {
  readConfiguration,
  readContactConfiguration,
  readSubscriptionConfiguration,
} from './config.js';
import { createContactSender, createResendProvider } from './contact.js';
import { createSubscriptionSender } from './subscriptions.js';

const application = createApplication(
  readConfiguration(process.env),
  async (dto) => {
    const config = readContactConfiguration(process.env);
    await createContactSender(config, createResendProvider(config))(dto);
  },
  async (method, dto) => {
    const config = readSubscriptionConfiguration(process.env);
    return createSubscriptionSender(config, fetch)(method, dto);
  },
);

export async function handler(event: APIGatewayProxyEventV2) {
  return application(event);
}

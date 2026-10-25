import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createApplication } from './application.js';
import { readConfiguration, readContactConfiguration } from './config.js';
import { createContactSender, createResendProvider } from './contact.js';

const application = createApplication(readConfiguration(process.env), async (dto) => {
  const config = readContactConfiguration(process.env);
  await createContactSender(config, createResendProvider(config))(dto);
});

export async function handler(event: APIGatewayProxyEventV2) {
  return application(event);
}

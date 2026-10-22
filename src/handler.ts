import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createApplication } from './application.js';
import { readConfiguration } from './config.js';

const application = createApplication(readConfiguration(process.env));

export async function handler(event: APIGatewayProxyEventV2) {
  return application(event);
}

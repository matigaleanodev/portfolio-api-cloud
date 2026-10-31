import type { GenerateOgEvent, LambdaResponse } from '@portfolio-api-cloud/contracts/editorial';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { createR2Client } from '../subscriptions/store.js';
import { readGenerateOgConfig } from '../editorial/config.js';
import { generateOg } from '../editorial/generate-og.js';
import { generateOgImage } from '../editorial/og.js';
import { createSensitiveConfiguration, memoizeBySnapshot } from '../editorial/runtime.js';

const dependencies = memoizeBySnapshot(
  createSensitiveConfiguration(functions.generateOg),
  (sensitive) => {
    const config = readGenerateOgConfig(process.env);
    return {
      storage: createR2Client({
        ...config.media,
        accessKeyId: sensitive.R2_MEDIA_ACCESS_KEY_ID!,
        secretAccessKey: sensitive.R2_MEDIA_SECRET_ACCESS_KEY!,
      }),
      bucket: config.media.bucket,
      mediaBaseUrl: config.mediaBaseUrl,
      ogObjectPrefix: config.ogObjectPrefix,
      render: (input: Parameters<typeof generateOgImage>[0]) => generateOgImage(input),
    };
  },
);

export const handler = async (event: GenerateOgEvent): Promise<LambdaResponse> =>
  generateOg(event, dependencies);

import type {
  LambdaResponse,
  ProcessReleaseInvocation,
} from '@portfolio-api-cloud/contracts/editorial';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { createR2Client } from '../subscriptions/store.js';
import { readProcessReleaseConfig } from '../editorial/config.js';
import { createLambdaInvoker } from '../editorial/invoke-lambda.js';
import { normalizeProcessReleaseEvent, processRelease } from '../editorial/release.js';
import { createSensitiveConfiguration, memoizeBySnapshot } from '../editorial/runtime.js';

const invoke = createLambdaInvoker();
const dependencies = memoizeBySnapshot(
  createSensitiveConfiguration(functions.processRelease),
  (sensitive) => {
    const config = readProcessReleaseConfig(process.env);
    return {
      storage: createR2Client({
        ...config.media,
        accessKeyId: sensitive.R2_MEDIA_ACCESS_KEY_ID!,
        secretAccessKey: sensitive.R2_MEDIA_SECRET_ACCESS_KEY!,
      }),
      bucket: config.media.bucket,
      invoke,
      generateOgFunctionName: config.generateOgFunctionName,
      notifyPostFunctionName: config.notifyPostFunctionName,
      maxAttempts: config.maxAttempts,
    };
  },
);

/** Acepta `{manifest}` o el manifiesto crudo que envía el CI de portfolio. */
export const handler = async (event: ProcessReleaseInvocation): Promise<LambdaResponse> =>
  processRelease(normalizeProcessReleaseEvent(event), dependencies);

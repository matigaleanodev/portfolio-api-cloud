import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

const LIMIT = 5;
const DURATION_SECONDS = 3600;

export function createContactQuota() {
  const limiter = new RateLimiterMemory({
    keyPrefix: 'contact',
    points: LIMIT,
    duration: DURATION_SECONDS,
    blockDuration: DURATION_SECONDS,
  });

  return async (ip: string): Promise<{ blocked: boolean; headers: Record<string, string> }> => {
    try {
      const result = await limiter.consume(ip);
      return {
        blocked: false,
        headers: {
          'x-ratelimit-limit': String(LIMIT),
          'x-ratelimit-remaining': String(result.remainingPoints),
          'x-ratelimit-reset': String(Math.ceil(result.msBeforeNext / 1000)),
        },
      };
    } catch (error) {
      if (!(error instanceof RateLimiterRes)) throw error;
      return {
        blocked: true,
        headers: {
          'retry-after': String(Math.ceil(error.msBeforeNext / 1000)),
        },
      };
    }
  };
}

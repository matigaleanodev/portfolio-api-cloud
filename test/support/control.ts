import type { AiReservation, ControlStore, Counter } from '../../src/shared-control.js';
export class SimulatedControlStore implements ControlStore {
  readonly records = new Map<string, Counter>();
  readonly reservations: AiReservation[] = [];
  unavailable = false;
  rejectReservations = false;
  async get(key: string) {
    if (this.unavailable) throw new Error('Storage unavailable: sensitive detail');
    const value = this.records.get(key);
    return value ? { ...value } : null;
  }
  async replace(key: string, previous: Counter | null, next: Counter) {
    if (this.unavailable) throw new Error('Storage unavailable');
    if ((this.records.get(key)?.version ?? null) !== (previous?.version ?? null)) return false;
    this.records.set(key, { ...next });
    return true;
  }
  async reserveAi(reservation: AiReservation) {
    if (this.unavailable) throw new Error('Storage unavailable');
    if (this.rejectReservations) return false;
    const updates = reservation.keys.map((key, index) => {
      const used = (this.records.get(key)?.used ?? 0) + (index === 2 ? reservation.cost : 1);
      return { key, used, limit: index === 2 ? reservation.budget : 5 };
    });
    if (updates.some(({ used, limit }) => used > limit)) return false;
    for (const { key, used } of updates)
      this.records.set(key, {
        used,
        version: String(used),
        expiresAt: reservation.expiresAt,
        blocked: false,
      });
    this.reservations.push(reservation);
    return true;
  }
}
export const runtimeSecret = () => ({
  RESEND_API_KEY: 'fake',
  CONTACT_FROM_EMAIL: 'from@example.invalid',
  CONTACT_TO_EMAIL: 'to@example.invalid',
  PORTFOLIO_CLOUD_API_URL: 'https://cloud.example.invalid',
  QUOTA_KEY_SECRET: 's'.repeat(32),
  OPENAI_API_KEY: 'fake',
  AI_DAILY_BUDGET_MICROUSD: '1000000',
  AI_PRICING_VALID_UNTIL: new Date(Date.now() + 86400_000).toISOString(),
});
export const managedEnvironment = {
  TRUSTED_API_ID: 'local',
  QUOTA_TABLE_NAME: 'test-control',
  RUNTIME_SECRET_ARN:
    'arn:aws:secretsmanager:us-east-1:650387442642:secret:portfolio-api-cloud/test/runtime-abcdef',
  CORS_ORIGIN: 'https://frontend.example.invalid',
};

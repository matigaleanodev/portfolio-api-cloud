import type {
  DeliveryRecord,
  DeliveryStore,
} from '../../packages/runtime/src/editorial/delivery-ledger.js';

/** Doble en memoria con la misma escritura condicional por versión que DynamoDB. */
export class SimulatedDeliveryStore implements DeliveryStore {
  readonly records = new Map<string, DeliveryRecord>();
  failWrites: ((record: DeliveryRecord) => boolean) | undefined;
  async get(pk: string) {
    const record = this.records.get(pk);
    return record ? { ...record } : null;
  }
  async put(record: DeliveryRecord, previousVersion: string | null) {
    if (this.failWrites?.(record)) throw new Error('Ledger unavailable');
    if ((this.records.get(record.pk)?.version ?? null) !== previousVersion) return false;
    this.records.set(record.pk, { ...record });
    return true;
  }
}

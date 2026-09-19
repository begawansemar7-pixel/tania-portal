import { randomUUID } from 'node:crypto';
import type { MemoryQuery, MemoryRecord, MemoryStore, MemoryWrite } from '@tania/core/memory';
import type { Actor } from '@/lib/identity/types';
import { canAccessClassification } from '@tania/types';

/**
 * Process-local memory.
 *
 * Enough to close the REMEMBERING stage honestly — what a task concluded is
 * written somewhere and can be read back — while staying explicit that it does
 * not survive a restart. Reads are permission-aware: a record classified above
 * the reader's clearance is never returned.
 */
export class InMemoryMemoryStore implements MemoryStore {
  readonly id = 'memory';
  private readonly records: MemoryRecord[] = [];

  async remember(write: MemoryWrite, actor: Actor): Promise<MemoryRecord> {
    const record: MemoryRecord = {
      id: randomUUID(),
      scope: write.scope,
      key: write.key,
      value: write.value,
      classification: write.classification,
      actorId: actor.id,
      createdAt: new Date().toISOString(),
      ...(write.sessionId === undefined ? {} : { sessionId: write.sessionId }),
      ...(write.expiresAt === undefined ? {} : { expiresAt: write.expiresAt }),
    };

    this.records.push(record);
    return record;
  }

  async recall(query: MemoryQuery, actor: Actor): Promise<MemoryRecord[]> {
    const needle = query.query?.toLowerCase();

    return this.records
      .filter((record) => canAccessClassification(actor.clearance, record.classification))
      .filter((record) => (record.actorId === undefined ? true : record.actorId === actor.id))
      .filter((record) => (query.scope ? record.scope === query.scope : true))
      .filter((record) => (query.sessionId ? record.sessionId === query.sessionId : true))
      .filter((record) =>
        needle
          ? record.key.toLowerCase().includes(needle) ||
            record.value.toLowerCase().includes(needle)
          : true,
      )
      .slice(-query.limit);
  }

  async forget(recordId: string, actor: Actor): Promise<void> {
    const index = this.records.findIndex(
      (record) => record.id === recordId && record.actorId === actor.id,
    );
    if (index >= 0) this.records.splice(index, 1);
  }

  async forgetSession(sessionId: string, actor: Actor): Promise<number> {
    let removed = 0;
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index];
      if (record?.sessionId === sessionId && record.actorId === actor.id) {
        this.records.splice(index, 1);
        removed += 1;
      }
    }
    return removed;
  }
}

import { randomUUID } from 'node:crypto';
import type { LeadRecord, RunRecord } from '../runs/types.js';
import type { Repo } from './repo.js';

/** In-memory Repo with the same behaviour as pgRepo, for tests. */
export function memoryRepo(): Repo & { runs: Map<string, RunRecord>; leads: Map<string, LeadRecord> } {
  const runs = new Map<string, RunRecord>();
  const leads = new Map<string, LeadRecord>();
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    runs,
    leads,
    async createRun({ sourceType, params, buybox, stats }) {
      const now = new Date();
      const run: RunRecord = { id: randomUUID(), sourceType, params, status: 'queued', stats, buybox, error: null, createdAt: now, updatedAt: now };
      runs.set(run.id, clone(run));
      return clone(run);
    },
    async getRun(id) {
      const r = runs.get(id);
      return r ? clone(r) : null;
    },
    async updateRun(id, patch) {
      const r = runs.get(id);
      if (!r) return;
      runs.set(id, { ...r, ...clone(patch), updatedAt: new Date() } as RunRecord);
    },
    async insertLeads(runId, newLeads) {
      return newLeads.map((l) => {
        const rec: LeadRecord = { ...clone(l), runId, id: randomUUID() };
        leads.set(rec.id, rec);
        return clone(rec);
      });
    },
    async updateLead(id, patch) {
      const l = leads.get(id);
      if (l) leads.set(id, { ...l, ...clone(patch) });
    },
    async listLeads(runId) {
      return [...leads.values()].filter((l) => l.runId === runId).map(clone);
    },
    async failOrphanedRuns(message) {
      let n = 0;
      for (const r of runs.values()) {
        if (r.status === 'queued' || r.status === 'running') {
          runs.set(r.id, { ...r, status: 'failed', error: message });
          n++;
        }
      }
      return n;
    },
  };
}

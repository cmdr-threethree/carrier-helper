import { config } from '../config';
import {
  deleteSnapshots,
  latestSnapshotForCarrier,
  listAllCarriers,
} from './repos';
import { getDb } from './db';

export interface RetentionResult {
  deletedSnapshots: number;
  deletedSummaries: number;
  remainingSnapshotBytes: number;
}

async function deleteOldSummaries(cutoff: number): Promise<number> {
  const db = await getDb();
  const old = await db.getAllFromIndex('summaries', 'by-time', IDBKeyRange.upperBound(cutoff));
  if (!old.length) return 0;
  const tx = db.transaction('summaries', 'readwrite');
  await Promise.all(old.map((summary) => tx.store.delete(summary.id)));
  await tx.done;
  return old.length;
}

export async function applyRetention(now = Date.now()): Promise<RetentionResult> {
  const db = await getDb();
  const rawCutoff = now - config.rawRetentionMs;
  const summaryCutoff = now - config.summaryRetentionMs;

  const deletedSummaries = await deleteOldSummaries(summaryCutoff);

  const carriers = await listAllCarriers();
  const protectedIds = new Set<string>();
  await Promise.all(
    carriers.map(async (carrier) => {
      const latest = await latestSnapshotForCarrier(carrier.id);
      if (latest) protectedIds.add(latest.id);
    }),
  );

  const old = await db.getAllFromIndex('snapshots', 'by-time', IDBKeyRange.upperBound(rawCutoff));
  const deletable = old.filter((snapshot) => !protectedIds.has(snapshot.id));
  await deleteSnapshots(deletable.map((snapshot) => snapshot.id));
  let deletedSnapshots = deletable.length;

  const remaining = await db.getAll('snapshots');
  let remainingSnapshotBytes = remaining.reduce((sum, snapshot) => sum + (snapshot.size || 0), 0);

  if (remainingSnapshotBytes > config.rawStorageCapBytes) {
    remaining.sort((a, b) => a.fetchedAt - b.fetchedAt);
    const toDelete: string[] = [];
    for (const snapshot of remaining) {
      if (remainingSnapshotBytes <= config.rawStorageCapBytes) break;
      if (protectedIds.has(snapshot.id)) continue;
      toDelete.push(snapshot.id);
      remainingSnapshotBytes -= snapshot.size || 0;
    }
    await deleteSnapshots(toDelete);
    deletedSnapshots += toDelete.length;
  }

  return {
    deletedSnapshots,
    deletedSummaries,
    remainingSnapshotBytes,
  };
}

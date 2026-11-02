import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyRetention } from '../src/storage/retention';
import { resetDatabaseForTests } from '../src/storage/db';
import {
  latestSnapshotForCarrier,
  putSnapshotIfAbsent,
  putSummaryIfAbsent,
  saveAccount,
  saveCarrier,
  summariesForCarrier,
} from '../src/storage/repos';
import { makeAccount, makeCarrier, makeSnapshot, makeSummary } from './helpers';

describe('retention', () => {
  const now = 1_900_000_000_000;

  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('keeps the latest raw snapshot per carrier and prunes old summaries', async () => {
    const account = makeAccount();
    const carrier = makeCarrier();
    const secondCarrier = makeCarrier({ id: 'carrier-2', callsign: 'DEF-456' });
    await saveAccount(account);
    await saveCarrier(carrier);
    await saveCarrier(secondCarrier);

    const oldA = makeSnapshot({
      carrierId: carrier.id,
      fetchedAt: now - 10 * 24 * 60 * 60 * 1000,
    });
    const oldB = makeSnapshot({
      carrierId: carrier.id,
      fetchedAt: now - 9 * 24 * 60 * 60 * 1000,
    });
    const recent = makeSnapshot({
      carrierId: carrier.id,
      fetchedAt: now - 60 * 60 * 1000,
    });
    const oldOnly = makeSnapshot({
      carrierId: secondCarrier.id,
      fetchedAt: now - 20 * 24 * 60 * 60 * 1000,
    });
    await putSnapshotIfAbsent(oldA);
    await putSnapshotIfAbsent(oldB);
    await putSnapshotIfAbsent(recent);
    await putSnapshotIfAbsent(oldOnly);

    await putSummaryIfAbsent(
      makeSummary({ carrierId: carrier.id, fetchedAt: now - 100 * 24 * 60 * 60 * 1000 }),
    );
    await putSummaryIfAbsent(
      makeSummary({ carrierId: carrier.id, fetchedAt: now - 10 * 24 * 60 * 60 * 1000 }),
    );

    const result = await applyRetention(now);
    expect(result.deletedSnapshots).toBe(2);
    expect(result.deletedSummaries).toBe(1);

    const latest = await latestSnapshotForCarrier(carrier.id);
    expect(latest?.id).toBe(recent.id);
    const secondLatest = await latestSnapshotForCarrier(secondCarrier.id);
    expect(secondLatest?.id).toBe(oldOnly.id);
    expect(await summariesForCarrier(carrier.id)).toHaveLength(1);
  });
});

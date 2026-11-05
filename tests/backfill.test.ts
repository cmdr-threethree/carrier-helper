import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backfillItemHistory } from '../src/storage/backfill';
import { resetDatabaseForTests } from '../src/storage/db';
import {
  marketPointsForCarrier,
  cargoPointsForCarrier,
  putSnapshotIfAbsent,
} from '../src/storage/repos';
import { makeRaw, makeSnapshot } from './helpers';

describe('item history backfill', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('derives points from retained raw snapshots once', async () => {
    const raw = makeRaw({
      market: {
        commodities: [
          {
            id: 1,
            name: 'gold',
            locName: 'Gold',
            stock: 10,
            buyPrice: 100,
            sellPrice: 110,
            demand: 20,
          },
        ],
      },
      cargo: [{ commodity: 'gold', qty: 5, value: 500 }],
    });
    await putSnapshotIfAbsent(makeSnapshot({ fetchedAt: 1_000 }, raw));

    const count = await backfillItemHistory();
    expect(count).toBe(2);
    expect(await marketPointsForCarrier('carrier-1')).toHaveLength(1);
    expect(await cargoPointsForCarrier('carrier-1')).toHaveLength(1);
    expect(await backfillItemHistory()).toBe(0);
  });
});

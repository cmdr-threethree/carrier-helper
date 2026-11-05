import { extractCargoPoints, extractMarketPoints } from '../capi/extract';
import { allSnapshots, getMeta, putCargoPoints, putMarketPoints, setMeta } from './repos';
import type { CargoPoint, MarketPoint } from './schema';

const BACKFILL_KEY = 'item-history-backfill-v1';

export async function backfillItemHistory(): Promise<number> {
  if (await getMeta<boolean>(BACKFILL_KEY)) return 0;

  const snapshots = await allSnapshots();
  const marketPoints: MarketPoint[] = [];
  const cargoPoints: CargoPoint[] = [];

  for (const snapshot of snapshots) {
    marketPoints.push(
      ...extractMarketPoints(
        snapshot.raw,
        snapshot.carrierId,
        snapshot.accountId,
        snapshot.fetchedAt,
      ),
    );
    cargoPoints.push(
      ...extractCargoPoints(
        snapshot.raw,
        snapshot.carrierId,
        snapshot.accountId,
        snapshot.fetchedAt,
      ),
    );
  }

  await putMarketPoints(marketPoints);
  await putCargoPoints(cargoPoints);
  await setMeta(BACKFILL_KEY, true);
  return marketPoints.length + cargoPoints.length;
}

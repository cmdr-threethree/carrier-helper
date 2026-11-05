import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AccountRecord,
  CargoDay,
  CargoPoint,
  CarrierRecord,
  MarketDay,
  MarketPoint,
  MetaRecord,
  SnapshotRecord,
  SummaryRecord,
} from './schema';

export const DB_NAME = 'carrier-helper';
export const DB_VERSION = 2;

export interface CarrierDB extends DBSchema {
  accounts: {
    key: string;
    value: AccountRecord;
    indexes: {
      'by-created': number;
    };
  };
  carriers: {
    key: string;
    value: CarrierRecord;
    indexes: {
      'by-account': string;
      'by-account-callsign': [string, string];
      'by-last-seen': number;
    };
  };
  snapshots: {
    key: string;
    value: SnapshotRecord;
    indexes: {
      'by-account-time': [string, number];
      'by-carrier-time': [string, number];
      'by-time': number;
    };
  };
  summaries: {
    key: string;
    value: SummaryRecord;
    indexes: {
      'by-account-time': [string, number];
      'by-carrier-time': [string, number];
      'by-time': number;
    };
  };
  marketPoints: {
    key: string;
    value: MarketPoint;
    indexes: {
      'by-account': string;
      'by-carrier-time': [string, number];
      'by-carrier-commodity-time': [string, string, number];
      'by-time': number;
    };
  };
  cargoPoints: {
    key: string;
    value: CargoPoint;
    indexes: {
      'by-account': string;
      'by-carrier-time': [string, number];
      'by-carrier-commodity-time': [string, string, number];
      'by-time': number;
    };
  };
  marketDays: {
    key: string;
    value: MarketDay;
    indexes: {
      'by-account': string;
      'by-carrier-day': [string, number];
      'by-carrier-commodity-day': [string, string, number];
      'by-day': number;
    };
  };
  cargoDays: {
    key: string;
    value: CargoDay;
    indexes: {
      'by-account': string;
      'by-carrier-day': [string, number];
      'by-carrier-commodity-day': [string, string, number];
      'by-day': number;
    };
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
}

let databasePromise: Promise<IDBPDatabase<CarrierDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<CarrierDB>> {
  if (!databasePromise) {
    databasePromise = openDB<CarrierDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const accounts = db.createObjectStore('accounts', { keyPath: 'id' });
          accounts.createIndex('by-created', 'createdAt');

          const carriers = db.createObjectStore('carriers', { keyPath: 'id' });
          carriers.createIndex('by-account', 'accountId');
          carriers.createIndex('by-account-callsign', ['accountId', 'callsign'], {
            unique: true,
          });
          carriers.createIndex('by-last-seen', 'lastSeenAt');

          const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' });
          snapshots.createIndex('by-account-time', ['accountId', 'fetchedAt']);
          snapshots.createIndex('by-carrier-time', ['carrierId', 'fetchedAt']);
          snapshots.createIndex('by-time', 'fetchedAt');

          const summaries = db.createObjectStore('summaries', { keyPath: 'id' });
          summaries.createIndex('by-account-time', ['accountId', 'fetchedAt']);
          summaries.createIndex('by-carrier-time', ['carrierId', 'fetchedAt']);
          summaries.createIndex('by-time', 'fetchedAt');

          db.createObjectStore('meta', { keyPath: 'key' });
        }

        if (oldVersion < 2) {
          const marketPoints = db.createObjectStore('marketPoints', { keyPath: 'id' });
          marketPoints.createIndex('by-account', 'accountId');
          marketPoints.createIndex('by-carrier-time', ['carrierId', 'fetchedAt']);
          marketPoints.createIndex('by-carrier-commodity-time', [
            'carrierId',
            'commodityKey',
            'fetchedAt',
          ]);
          marketPoints.createIndex('by-time', 'fetchedAt');

          const cargoPoints = db.createObjectStore('cargoPoints', { keyPath: 'id' });
          cargoPoints.createIndex('by-account', 'accountId');
          cargoPoints.createIndex('by-carrier-time', ['carrierId', 'fetchedAt']);
          cargoPoints.createIndex('by-carrier-commodity-time', [
            'carrierId',
            'commodityKey',
            'fetchedAt',
          ]);
          cargoPoints.createIndex('by-time', 'fetchedAt');

          const marketDays = db.createObjectStore('marketDays', { keyPath: 'id' });
          marketDays.createIndex('by-account', 'accountId');
          marketDays.createIndex('by-carrier-day', ['carrierId', 'dayStart']);
          marketDays.createIndex('by-carrier-commodity-day', [
            'carrierId',
            'commodityKey',
            'dayStart',
          ]);
          marketDays.createIndex('by-day', 'dayStart');

          const cargoDays = db.createObjectStore('cargoDays', { keyPath: 'id' });
          cargoDays.createIndex('by-account', 'accountId');
          cargoDays.createIndex('by-carrier-day', ['carrierId', 'dayStart']);
          cargoDays.createIndex('by-carrier-commodity-day', [
            'carrierId',
            'commodityKey',
            'dayStart',
          ]);
          cargoDays.createIndex('by-day', 'dayStart');
        }
      },
      blocked() {
        console.warn('[carrier-helper] Database upgrade blocked by another tab.');
      },
      blocking() {
        console.warn('[carrier-helper] Closing database so another tab can upgrade.');
        void databasePromise?.then((db) => db.close());
        databasePromise = null;
      },
    });
  }
  return databasePromise;
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) return;
  const db = await databasePromise;
  db.close();
  databasePromise = null;
}

export async function resetDatabaseForTests(): Promise<void> {
  await closeDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

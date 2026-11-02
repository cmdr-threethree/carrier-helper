import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportAllData } from '../src/backup/export';
import { importBackup } from '../src/backup/import';
import { safeValidateBackup } from '../src/backup/validate';
import { resetDatabaseForTests } from '../src/storage/db';
import {
  clearDataStores,
  getAccount,
  latestSnapshotForCarrier,
  listAccounts,
  putSnapshotIfAbsent,
  putSummaryIfAbsent,
  saveAccount,
  saveCarrier,
} from '../src/storage/repos';
import { makeAccount, makeCarrier, makeSnapshot, makeSummary } from './helpers';

describe('backup export and import', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('never exports tokens', async () => {
    const account = makeAccount({
      tokens: {
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        tokenType: 'Bearer',
        accessExpiresAt: Date.now(),
      },
    });
    const carrier = makeCarrier();
    await saveAccount(account);
    await saveCarrier(carrier);
    await putSnapshotIfAbsent(makeSnapshot());
    await putSummaryIfAbsent(makeSummary());

    const backup = await exportAllData();
    const text = JSON.stringify(backup);
    expect(text).not.toContain('access-secret');
    expect(text).not.toContain('refresh-secret');
    expect(text).not.toContain('"tokens"');
    expect(backup.accounts[0]?.needsReauth).toBe(true);
  });

  it('imports a backup and requires re-authorization', async () => {
    const carrier = makeCarrier();
    await saveAccount(makeAccount());
    await saveCarrier(carrier);
    const snapshot = makeSnapshot();
    await putSnapshotIfAbsent(snapshot);
    await putSummaryIfAbsent(makeSummary({ id: 'summary-1' }));

    const backup = await exportAllData();
    await clearDataStores();
    const result = await importBackup(backup, 'merge');

    expect(result.importedAccounts).toBe(1);
    expect(result.importedCarriers).toBe(1);
    expect(result.importedSnapshots).toBe(1);
    expect(result.importedSummaries).toBe(1);
    const account = await getAccount('account-1');
    expect(account?.tokens).toBeNull();
    expect(account?.needsReauth).toBe(true);
    expect((await latestSnapshotForCarrier(carrier.id))?.id).toBe(snapshot.id);
    expect(await listAccounts()).toHaveLength(1);
  });

  it('remaps an imported carrier to an existing local carrier with the same callsign', async () => {
    const carrier = makeCarrier();
    await saveAccount(makeAccount());
    await saveCarrier(carrier);

    await importBackup(
      {
        app: 'carrier-helper',
        schemaVersion: 1,
        exportedAt: 1,
        accounts: [{ id: 'account-1', platform: 'frontier', displayName: 'Test', needsReauth: true }],
        carriers: [
          {
            id: 'imported-carrier',
            accountId: 'account-1',
            callsign: 'ABC-123',
            vanityName: 'Test Carrier',
            currentSystem: 'Sol',
            lastSeenAt: 1,
          },
        ],
        snapshots: [
          {
            id: 'imported-snapshot',
            accountId: 'account-1',
            carrierId: 'imported-carrier',
            fetchedAt: 2,
            endpoint: '/fleetcarrier',
            httpStatus: 200,
            raw: { name: { callsign: 'ABC-123' } },
          },
        ],
        summaries: [],
      },
      'merge',
      10,
    );

    const snapshot = await latestSnapshotForCarrier(carrier.id);
    expect(snapshot?.id).toBe('imported-snapshot');
    expect(snapshot?.carrierId).toBe(carrier.id);
  });

  it('rejects unsupported backup versions', () => {
    const result = safeValidateBackup({
      app: 'carrier-helper',
      schemaVersion: 2,
      exportedAt: 1,
      accounts: [],
      carriers: [],
      snapshots: [],
      summaries: [],
    });
    expect(result.ok).toBe(false);
  });

  it('strips unexpected token fields during validation', () => {
    const result = safeValidateBackup({
      app: 'carrier-helper',
      schemaVersion: 1,
      exportedAt: 1,
      accounts: [{ id: 'a', tokens: { accessToken: 'x' } }],
      carriers: [],
      snapshots: [],
      summaries: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('tokens' in result.data.accounts[0]!).toBe(false);
    }
  });
});

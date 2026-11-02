import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseForTests } from '../src/storage/db';
import {
  deleteAccount,
  getAccount,
  latestSnapshotForCarrier,
  latestSummaryForCarrier,
  listCarriers,
  putSnapshotIfAbsent,
  putSummaryIfAbsent,
  saveAccount,
  saveCarrier,
} from '../src/storage/repos';
import { makeAccount, makeCarrier, makeSnapshot, makeSummary } from './helpers';

describe('account deletion', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('removes the account, carriers, snapshots, and summaries', async () => {
    const account = makeAccount();
    const carrier = makeCarrier();
    await saveAccount(account);
    await saveCarrier(carrier);
    await putSnapshotIfAbsent(makeSnapshot());
    await putSummaryIfAbsent(makeSummary());

    await deleteAccount(account.id);

    expect(await getAccount(account.id)).toBeUndefined();
    expect(await listCarriers(account.id)).toEqual([]);
    expect(await latestSnapshotForCarrier(carrier.id)).toBeNull();
    expect(await latestSummaryForCarrier(carrier.id)).toBeNull();
  });
});

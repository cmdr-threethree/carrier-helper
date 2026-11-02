import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  accountLabel,
  renameAccount,
} from '../src/auth/accounts';
import { createDemoAccount } from '../src/mock/demo';
import { resetDatabaseForTests } from '../src/storage/db';
import { getAccount, saveAccount } from '../src/storage/repos';
import { makeAccount } from './helpers';

describe('account labels', () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  afterEach(async () => {
    await resetDatabaseForTests();
  });

  it('renames an account persistently', async () => {
    const account = makeAccount({ displayName: 'Frontier account account-1' });
    await saveAccount(account);

    const updated = await renameAccount(account.id, '  CMDR Jameson  ');
    expect(updated.displayName).toBe('CMDR Jameson');
    expect((await getAccount(account.id))?.displayName).toBe('CMDR Jameson');
  });

  it('rejects empty or missing accounts', async () => {
    await saveAccount(makeAccount());
    await expect(renameAccount('account-1', '   ')).rejects.toMatchObject({
      code: 'invalid_data',
    });
    await expect(renameAccount('missing', 'CMDR')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('uses the supplied name when creating a demo account', async () => {
    const account = await createDemoAccount(1_900_000_000_000, 'CMDR Demo');
    expect(account.displayName).toBe('CMDR Demo');
    expect(accountLabel(account)).toBe('CMDR Demo');
  });

  it('falls back to the Frontier account id', () => {
    expect(accountLabel(makeAccount({ displayName: '' }))).toBe(
      'Frontier account account-1',
    );
  });
});

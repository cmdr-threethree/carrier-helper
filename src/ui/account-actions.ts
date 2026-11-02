import { connectAccount, renameAccount } from '../auth/accounts';
import { userMessage } from '../lib/errors';
import type { AccountRecord } from '../storage/schema';
import { promptAccountName } from './components/account-dialog';
import { showToast } from './components/toast';

export async function connectAccountWithPrompt(): Promise<AccountRecord | null> {
  const name = await promptAccountName({
    title: 'Name this commander',
    message:
      'Enter your in-game CMDR name. It is stored only in this browser and can be changed later in Settings.',
    submitLabel: 'Connect',
  });
  if (name === null) return null;
  return connectAccount(name);
}

export async function renameAccountWithPrompt(account: AccountRecord): Promise<boolean> {
  const name = await promptAccountName({
    title: 'Rename account',
    message: 'This label is local to this browser. It does not change anything in Elite Dangerous.',
    initial: account.displayName,
    submitLabel: 'Save',
  });
  if (name === null) return false;

  try {
    await renameAccount(account.id, name);
    showToast('Account renamed.', 'success');
    return true;
  } catch (error) {
    showToast(userMessage(error), 'error');
    return false;
  }
}

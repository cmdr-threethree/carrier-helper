import type { AccountRecord } from '../../storage/schema';
import type { Route } from '../route';

export interface PageContext {
  route: Route;
  accounts: AccountRecord[];
  selectedAccount: AccountRecord | null;
  navigate: (hash: string) => void;
}

export interface PageResult {
  node: Node;
  cleanup?: () => void;
}

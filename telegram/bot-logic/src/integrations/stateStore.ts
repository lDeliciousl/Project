import { UserState } from '../domain/state';
import { UserStatus } from '../domain/types';

export interface StateStore {
  get(chatId: string): Promise<UserState | null>;
  set(chatId: string, state: UserState): Promise<void>;
  delete(chatId: string): Promise<void>;
  listByStatus(
    status: UserStatus,
    limit: number
  ): Promise<Array<{ chatId: string; state: UserState }>>;
}

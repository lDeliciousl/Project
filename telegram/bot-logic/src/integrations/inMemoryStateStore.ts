import { StateStore } from './stateStore';
import { UserState } from '../domain/state';
import { UserStatus } from '../domain/types';

export class InMemoryStateStore implements StateStore {
  private readonly store = new Map<string, UserState>();

  async get(chatId: string): Promise<UserState | null> {
    return this.store.get(chatId) || null;
  }

  async set(chatId: string, state: UserState): Promise<void> {
    this.store.set(chatId, state);
  }

  async delete(chatId: string): Promise<void> {
    this.store.delete(chatId);
  }

  async listByStatus(
    status: UserStatus,
    limit: number
  ): Promise<Array<{ chatId: string; state: UserState }>> {
    const results: Array<{ chatId: string; state: UserState }> = [];
    for (const [chatId, state] of this.store.entries()) {
      if (state.status === status) {
        results.push({ chatId, state });
      }
      if (results.length >= limit) {
        break;
      }
    }
    return results;
  }
}

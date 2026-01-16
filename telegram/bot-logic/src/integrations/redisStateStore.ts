import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { UserState } from '../domain/state';
import { UserStatus } from '../domain/types';
import { StateStore } from './stateStore';
import { logger } from '../logger';

export class RedisStateStore implements StateStore {
  private readonly client: RedisClientType;
  private ready: Promise<void>;

  constructor() {
    this.client = createClient({ url: config.redisUrl });
    this.ready = this.client.connect().then(() => {
      logger.info('RedisStateStore connected');
    });
    this.client.on('error', (error) => {
      logger.error({ error }, 'Redis error');
    });
  }

  private key(chatId: string) {
    return `${config.redisKeyPrefix}${chatId}`;
  }

  private async ensureReady() {
    await this.ready;
  }

  async get(chatId: string): Promise<UserState | null> {
    await this.ensureReady();
    const value = await this.client.get(this.key(chatId));
    if (!value) {
      return null;
    }
    return JSON.parse(value) as UserState;
  }

  async set(chatId: string, state: UserState): Promise<void> {
    await this.ensureReady();
    await this.client.set(this.key(chatId), JSON.stringify(state));
  }

  async delete(chatId: string): Promise<void> {
    await this.ensureReady();
    await this.client.del(this.key(chatId));
  }

  async listByStatus(
    status: UserStatus,
    limit: number
  ): Promise<Array<{ chatId: string; state: UserState }>> {
    await this.ensureReady();
    const results: Array<{ chatId: string; state: UserState }> = [];
    let cursor = 0;
    do {
      const reply = await this.client.scan(cursor, {
        MATCH: `${config.redisKeyPrefix}*`,
        COUNT: 100
      });
      cursor = reply.cursor;
      for (const key of reply.keys) {
        const raw = await this.client.get(key);
        if (!raw) {
          continue;
        }
        const state = JSON.parse(raw) as UserState;
        if (state.status === status) {
          results.push({ chatId: key.replace(config.redisKeyPrefix, ''), state });
          if (results.length >= limit) {
            return results;
          }
        }
      }
    } while (cursor !== 0 && results.length < limit);

    return results;
  }
}

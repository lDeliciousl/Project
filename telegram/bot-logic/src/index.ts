import { config } from './config';
import { logger } from './logger';
import { InMemoryStateStore } from './integrations/inMemoryStateStore';
import { RedisStateStore } from './integrations/redisStateStore';
import { startBotLogicServer } from './bot/botLogicServer';

const bootstrap = async () => {
  const store = config.useRedis ? new RedisStateStore() : new InMemoryStateStore();
  startBotLogicServer(store);
};

bootstrap().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});

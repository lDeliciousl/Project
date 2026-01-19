import dotenv from 'dotenv';

dotenv.config();

const toBool = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
};

const toNumber = (value: string | undefined, defaultValue: number) => {
  if (!value) {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  botLogicPort: toNumber(process.env.BOT_LOGIC_PORT, 3005),
  authModuleUrl: process.env.AUTH_MODULE_URL || 'http://auth-module:8001',
  mainModuleUrl: process.env.MAIN_MODULE_URL || 'http://main-module:3002',
  useRedis: toBool(process.env.USE_REDIS, true),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX || 'telegram:',
  useMocks: toBool(process.env.USE_MOCKS, false),
  mockAutoApprove: toBool(process.env.MOCK_AUTH_AUTO_APPROVE, false)
};

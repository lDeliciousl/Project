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
  telegramToken: process.env.TELEGRAM_TOKEN || '',
  botLogicUrl: process.env.BOT_LOGIC_URL || 'http://localhost:3005',
  runTelegramClient: toBool(process.env.RUN_TELEGRAM_CLIENT, true),
  pollIntervalMs: toNumber(process.env.POLL_INTERVAL_MS, 1000),
  cronAuthCheckMs: toNumber(process.env.CRON_AUTH_CHECK_MS, 15000),
  cronNotificationsMs: toNumber(process.env.CRON_NOTIFICATIONS_MS, 20000)
};

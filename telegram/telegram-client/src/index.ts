import { config } from './config';
import { logger } from './logger';
import { startTelegramClient } from './client/telegramClient';

const bootstrap = async () => {
  if (config.runTelegramClient) {
    await startTelegramClient();
  }

  if (!config.runTelegramClient) {
    logger.warn('RUN_TELEGRAM_CLIENT is false. Nothing to run.');
  }
};

bootstrap().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});

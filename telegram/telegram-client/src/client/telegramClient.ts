import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { logger } from '../logger';
import { BotResponse } from '../types';

type CronResponse = {
  results: Array<{ chatId: string; messages: { text: string }[] }>;
};

const toBotResponse = (data: unknown): BotResponse => {
  if (!data || typeof data !== 'object' || !('messages' in data)) {
    return { messages: [] };
  }
  return data as BotResponse;
};

export const startTelegramClient = async (): Promise<void> => {
  if (!config.telegramToken) {
    logger.warn('TELEGRAM_TOKEN is missing, Telegram client is disabled.');
    return;
  }

  const bot = new TelegramBot(config.telegramToken, {
    polling: { interval: config.pollIntervalMs }
  });

  logger.info('Telegram client started (polling).');

  bot.on('message', async (msg) => {
    if (!msg.text || !msg.chat?.id) {
      return;
    }
    const payload = {
      chat_id: String(msg.chat.id),
      message_id: String(msg.message_id),
      text: msg.text,
      timestamp: msg.date ?? Math.floor(Date.now() / 1000),
      user: {
        username: msg.from?.username,
        first_name: msg.from?.first_name,
        last_name: msg.from?.last_name
      }
    };

    try {
      const response = await axios.post(`${config.botLogicUrl}/api/telegram/update`, payload);
      const data = toBotResponse(response.data);
      for (const message of data.messages || []) {
        await bot.sendMessage(msg.chat.id, message.text);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to handle telegram update');
      try {
        await bot.sendMessage(msg.chat.id, 'Ошибка обработки. Попробуйте позже.');
      } catch (sendError) {
        logger.warn({ error: sendError }, 'Failed to send error message to chat');
      }
    }
  });

  const runCron = async (path: string) => {
    try {
      const response = await axios.post<CronResponse>(
        `${config.botLogicUrl}${path}`,
        { limit: 100 }
      );
      const results = response.data.results || [];
      for (const result of results) {
        for (const message of result.messages) {
          await bot.sendMessage(Number(result.chatId), message.text);
        }
      }
    } catch (error) {
      logger.warn({ error }, `Cron failed: ${path}`);
    }
  };

  setInterval(() => runCron('/api/telegram/cron/auth-check'), config.cronAuthCheckMs);
  setInterval(() => runCron('/api/telegram/cron/notifications'), config.cronNotificationsMs);
};

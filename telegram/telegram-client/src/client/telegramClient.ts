import axios from 'axios';
import TelegramBot, { type KeyboardButton, type SendMessageOptions } from 'node-telegram-bot-api';
import { config } from '../config';
import { logger } from '../logger';
import { BotResponse, TelegramMessageOptions } from '../types';

type CronResponse = {
  results: Array<{ chatId: string; messages: Array<{ text: string; options?: TelegramMessageOptions }> }>;
};

const toBotResponse = (data: unknown): BotResponse => {
  if (!data || typeof data !== 'object' || !('messages' in data)) {
    return { messages: [] };
  }
  return data as BotResponse;
};

const toKeyboardButtons = (rows: string[][]): KeyboardButton[][] =>
  rows.map((row) => row.map((text) => ({ text })));

const normalizeOptions = (options?: TelegramMessageOptions): SendMessageOptions | undefined => {
  if (!options) {
    return undefined;
  }

  let replyMarkup: SendMessageOptions['reply_markup'] | undefined;
  const rawMarkup = options.reply_markup;
  if (rawMarkup) {
    if (rawMarkup.inline_keyboard) {
      replyMarkup = { inline_keyboard: rawMarkup.inline_keyboard };
    } else if (rawMarkup.remove_keyboard) {
      replyMarkup = { remove_keyboard: true };
    } else if (rawMarkup.keyboard) {
      replyMarkup = {
        keyboard: toKeyboardButtons(rawMarkup.keyboard),
        resize_keyboard: rawMarkup.resize_keyboard,
        one_time_keyboard: rawMarkup.one_time_keyboard
      };
    }
  }

  return {
    parse_mode: options.parse_mode,
    disable_web_page_preview: options.disable_web_page_preview,
    reply_markup: replyMarkup
  };
};

const sendMessageSafe = async (
  bot: TelegramBot,
  chatId: number,
  text: string,
  options?: TelegramMessageOptions
): Promise<void> => {
  const normalized = normalizeOptions(options);
  try {
    await bot.sendMessage(chatId, text, normalized);
  } catch (error) {
    if (normalized?.parse_mode) {
      try {
        await bot.sendMessage(chatId, text, { ...normalized, parse_mode: undefined });
        return;
      } catch (retryError) {
        logger.warn({ error: retryError }, 'Failed to send telegram message after retry');
        return;
      }
    }
    logger.warn({ error }, 'Failed to send telegram message');
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const postWithRetry = async <T>(url: string, data: unknown, attempts = 3): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await axios.post<T>(url, data);
      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await wait(300 * (attempt + 1));
      }
    }
  }
  throw lastError;
};

const KNOWN_COMMANDS = new Set([
  'help',
  'start',
  'actions',
  'permissions',
  'login',
  'logout',
  'cancel',
  'users',
  'user',
  'user_name',
  'user_set_name',
  'user_courses',
  'user_grades',
  'user_tests',
  'user_roles',
  'user_set_roles',
  'user_block',
  'user_set_block',
  'user_add',
  'courses',
  'course',
  'course_create',
  'course_update',
  'course_delete',
  'course_students',
  'course_tests',
  'course_enroll',
  'course_unenroll',
  'tests',
  'test',
  'test_start',
  'test_answer',
  'test_finish',
  'test_next',
  'test_create',
  'test_activate',
  'test_add_question',
  'test_remove_question',
  'questions',
  'question',
  'question_create',
  'question_update',
  'question_delete',
  'attempt',
  'attempt_create',
  'attempt_finish',
  'attempt_answer',
  'answer',
  'notifications',
  'notifications_clear'
]);

const getCommandName = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }
  const [first] = trimmed.split(/\s+/, 1);
  const withoutSlash = first.slice(1);
  const [namePartRaw] = withoutSlash.split('?', 1);
  const [namePart] = namePartRaw.split('@', 1);
  return namePart.toLowerCase();
};

const isKnownCommand = (text: string): boolean => {
  const name = getCommandName(text);
  return name ? KNOWN_COMMANDS.has(name) : true;
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
    if (!isKnownCommand(msg.text)) {
      await sendMessageSafe(bot, msg.chat.id, '⚠️ Нет такой команды. Используйте /help.');
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
      const data = toBotResponse(
        await postWithRetry<BotResponse>(`${config.botLogicUrl}/api/telegram/update`, payload)
      );
      for (const message of data.messages || []) {
        await sendMessageSafe(bot, msg.chat.id, message.text, message.options);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to handle telegram update');
      const detail =
        (axios.isAxiosError(error) &&
          (error.response?.data as { error?: string; message?: string; detail?: string } | undefined)
            ?.detail) ||
        (axios.isAxiosError(error) &&
          (error.response?.data as { error?: string; message?: string; detail?: string } | undefined)
            ?.error) ||
        (axios.isAxiosError(error) &&
          (error.response?.data as { error?: string; message?: string; detail?: string } | undefined)
            ?.message);
      const fallbackText = detail ? `Ошибка обработки: ${detail}` : 'Ошибка обработки. Попробуйте позже.';
      try {
        await bot.sendMessage(msg.chat.id, fallbackText);
      } catch (sendError) {
        logger.warn({ error: sendError }, 'Failed to send error message to chat');
      }
    }
  });

  const runCron = async (path: string) => {
    try {
      const response = await postWithRetry<CronResponse>(`${config.botLogicUrl}${path}`, {
        limit: 100
      });
      const results = response.results || [];
      for (const result of results) {
        for (const message of result.messages) {
          await sendMessageSafe(bot, Number(result.chatId), message.text, message.options);
        }
      }
    } catch (error) {
      logger.warn({ error }, `Cron failed: ${path}`);
    }
  };

  setInterval(() => runCron('/api/telegram/cron/auth-check'), config.cronAuthCheckMs);
  setInterval(() => runCron('/api/telegram/cron/notifications'), config.cronNotificationsMs);
};

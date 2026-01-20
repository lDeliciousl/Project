export type UserStatus = 'anonymous' | 'authorized';

export type LoginType = 'github' | 'yandex' | 'code';

export type TelegramUser = {
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramUpdate = {
  chat_id: string;
  message_id: string;
  text: string;
  timestamp: number;
  user?: TelegramUser;
};

export type TelegramMessageOptions = {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disable_web_page_preview?: boolean;
  reply_markup?: {
    keyboard?: string[][];
    resize_keyboard?: boolean;
    one_time_keyboard?: boolean;
    remove_keyboard?: boolean;
    inline_keyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  };
};

export type TelegramMessage = {
  text: string;
  options?: TelegramMessageOptions;
};

export type BotResponse = {
  messages: TelegramMessage[];
  requires_reauth?: boolean;
};

export type ScheduledResponse = {
  chat_id: string;
  messages: TelegramMessage[];
};

export type AuthInitResponse = {
  auth_url?: string;
  code?: string;
};

export type AuthVerifyResponse = {
  status: 'pending' | 'approved' | 'granted' | 'denied' | 'expired';
  access_token?: string;
  refresh_token?: string;
};

export type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

export type NotificationResponse = {
  notifications: string[];
};

export type Command = {
  name: string;
  params: Record<string, string>;
  args: string[];
  raw: string;
};

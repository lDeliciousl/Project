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

export type TelegramMessage = {
  text: string;
};

export type BotResponse = {
  messages: TelegramMessage[];
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
  status: 'pending' | 'approved' | 'denied' | 'expired';
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

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

export type BotResponse = {
  messages: Array<{ text: string; options?: TelegramMessageOptions }>;
};

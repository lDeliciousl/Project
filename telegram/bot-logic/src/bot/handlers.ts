import { v4 as uuidv4 } from 'uuid';
import { parseCommand } from '../domain/commands';
import { createAnonymousState, createAuthorizedState, UserState } from '../domain/state';
import { BotResponse, Command, LoginType, TelegramUpdate } from '../domain/types';
import { AuthClient } from '../integrations/authClient';
import { MainClient } from '../integrations/mainClient';
import { StateStore } from '../integrations/stateStore';
import { permissionsMessage } from './permissions';
import { actionsHelpMessage, handleActionCommand } from './actions';

const LOGIN_TYPES: LoginType[] = ['github', 'yandex', 'code'];

const baseMessageOptions = {
  parse_mode: 'Markdown' as const,
  disable_web_page_preview: true
};

const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['/help', '/actions'],
      ['/login GitHub', '/login Yandex'],
      ['/login Code', '/logout All'],
      ['/cancel']
    ],
    resize_keyboard: true
  }
};

const promptLogin = (): BotResponse => ({
  messages: [
    {
      text:
        '🔒 *Вы не авторизованы*\n' +
        'Используйте одну из команд входа:\n' +
        '• `/login github`\n' +
        '• `/login yandex`\n' +
        '• `/login code`',
      options: { ...baseMessageOptions, ...mainKeyboard }
    }
  ]
});

const helpMessage = (): BotResponse => ({
  messages: [
    {
      text:
        '👋 *Добро пожаловать!*\n' +
        'Вот что я умею:\n' +
        '• `/actions` — список команд\n' +
        '• `/login github|yandex|code` — вход\n' +
        '• `/cancel` — отменить ожидание авторизации\n' +
        '• `/logout` — выход\n' +
        '• `/logout All` — выйти со всех устройств',
      options: { ...baseMessageOptions, ...mainKeyboard }
    }
  ]
});

const approvedMessage = (): BotResponse => ({
  messages: [{ text: '✅ Авторизация успешна.', options: baseMessageOptions }]
});

const deniedMessage = (): BotResponse => ({
  messages: [{ text: '❌ Авторизация отклонена.', options: baseMessageOptions }]
});

const pendingMessage = (): BotResponse => ({
  messages: [
    {
      text:
        '⏳ Ожидаем подтверждение авторизации.\n' +
        'Если вход завис — завершите авторизацию по ссылке из /login или выполните /cancel для сброса.',
      options: baseMessageOptions
    }
  ]
});

const codeGeneratedMessage = (code: string): BotResponse => ({
  messages: [
    {
      text:
        `🔑 Код для входа: *${code}*\n` +
        'Введите его на устройстве, где вы уже авторизованы. На этом устройстве просто ожидайте подтверждения.',
      options: baseMessageOptions
    }
  ]
});

const invalidCodeMessage = (detail?: string): BotResponse => ({
  messages: [
    {
      text:
        detail
          ? `⚠️ Не удалось подтвердить код: ${detail}`
          : '⚠️ Неверный код. Попробуйте ещё раз или начните /login code.',
      options: baseMessageOptions
    }
  ]
});

const confirmCodeSent = (): BotResponse => ({
  messages: [
    {
      text: '✅ Код подтверждён. Вход на новом устройстве разрешён.',
      options: baseMessageOptions
    }
  ]
});

const confirmCodeFailed = (detail?: string): BotResponse => ({
  messages: [
    {
      text: detail
        ? `⚠️ Не удалось подтвердить код: ${detail}`
        : '⚠️ Не удалось подтвердить код. Проверьте цифры и попробуйте снова.',
      options: baseMessageOptions
    }
  ]
});

const extractErrorDetail = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const maybeError = error as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };
  return (
    maybeError.response?.data?.error ||
    maybeError.response?.data?.message ||
    maybeError.message
  );
};

const codeVerifiedMessage = (): BotResponse => ({
  messages: [{ text: '✅ Код подтверждён. Вы авторизованы.', options: baseMessageOptions }]
});

const alreadyAuthorized = (): BotResponse => ({
  messages: [{ text: '✅ Вы уже авторизованы.', options: baseMessageOptions }]
});

const loggedOut = (): BotResponse => ({
  messages: [{ text: '🚪 Сеанс завершён.', options: baseMessageOptions }]
});

const logoutAll = (): BotResponse => ({
  messages: [{ text: '🚪 Сеанс завершён на всех устройствах.', options: baseMessageOptions }]
});

const cancelMessage = (): BotResponse => ({
  messages: [
    {
      text:
        '✅ Ожидание отменено.\n' +
        'Команда /cancel сбрасывает незавершённую авторизацию.\n' +
        'Чтобы войти снова, используйте /login github|yandex|code.',
      options: baseMessageOptions
    }
  ]
});

const invalidCommand = (): BotResponse => ({
  messages: [{ text: '⚠️ Нет такой команды. Используйте /help.', options: baseMessageOptions }]
});

const isLoginCommand = (command: Command) => command.name === 'login';

const isActionsCommand = (command: Command) => command.name === 'actions';

const isPermissionsCommand = (command: Command) => command.name === 'permissions';

const isLogoutCommand = (command: Command) => command.name === 'logout';

const isCancelCommand = (command: Command) => command.name === 'cancel';

const parseLoginType = (command: Command): LoginType | null => {
  const type = command.params.type || command.args[0];
  if (!type) {
    return null;
  }
  const normalized = type.toLowerCase();
  return LOGIN_TYPES.includes(normalized as LoginType) ? (normalized as LoginType) : null;
};

const isConfirmCode = (command: Command): boolean =>
  command.name === 'text' && /^\d{4,8}$/.test(command.args[0] || '');

const isApprovedStatus = (
  status: 'pending' | 'approved' | 'granted' | 'denied' | 'expired'
): boolean => status === 'approved' || status === 'granted';

const isUnauthorizedError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeError = error as { response?: { status?: number } };
  return maybeError.response?.status === 401;
};

const refreshAuthorizedState = async (
  state: UserState,
  authClient: AuthClient,
  store: StateStore,
  chatId: string
): Promise<UserState | null> => {
  if (!state.refresh_token) {
    await store.delete(chatId);
    return null;
  }
  try {
    const tokens = await authClient.refreshTokens(state.refresh_token);
    const nextState = createAuthorizedState(tokens.access_token, tokens.refresh_token);
    await store.set(chatId, nextState);
    return nextState;
  } catch {
    await store.delete(chatId);
    return null;
  }
};

const handleAuthorizedCommand = async (
  command: Command,
  state: UserState,
  authClient: AuthClient,
  mainClient: MainClient,
  store: StateStore,
  chatId: string
): Promise<BotResponse> => {
  if (isCancelCommand(command)) {
    await store.delete(chatId);
    return cancelMessage();
  }

  if (isLoginCommand(command)) {
    return alreadyAuthorized();
  }

  if (isPermissionsCommand(command)) {
    return permissionsMessage();
  }

  if (isActionsCommand(command)) {
    return actionsHelpMessage();
  }

  if (isLogoutCommand(command)) {
    const all = command.params.all === 'true' || command.args.includes('all=true');
    await store.delete(chatId);
    if (all && state.refresh_token) {
      await authClient.logout(state.refresh_token);
      return logoutAll();
    }
    return loggedOut();
  }

  if (isConfirmCode(command) && state.refresh_token) {
    const code = command.args[0].trim();
    try {
      await authClient.verifyConfirmCode(code, state.refresh_token);
      return confirmCodeSent();
    } catch (error) {
      return confirmCodeFailed(extractErrorDetail(error));
    }
  }

  const actionResponse = await handleActionCommand(
    command,
    state.access_token || '',
    mainClient
  );
  if (actionResponse) {
    if (actionResponse.requires_reauth) {
      const refreshedState = await refreshAuthorizedState(state, authClient, store, chatId);
      if (!refreshedState) {
        return promptLogin();
      }
      const retryResponse = await handleActionCommand(
        command,
        refreshedState.access_token || '',
        mainClient
      );
      if (retryResponse) {
        if (retryResponse.requires_reauth) {
          await store.delete(chatId);
          return promptLogin();
        }
        return retryResponse;
      }
      return invalidCommand();
    }
    return actionResponse;
  }

  if (command.name === 'help' || command.name === 'start') {
    return helpMessage();
  }

  return invalidCommand();
};

export const handleUpdate = async (
  update: TelegramUpdate,
  store: StateStore,
  authClient: AuthClient,
  mainClient: MainClient
): Promise<BotResponse> => {
  let command = parseCommand(update.text || '');
  if (command.name.includes('_')) {
    const parts = command.name.split('_').filter(Boolean);
    const base = parts.shift();
    if (base && ['user', 'course', 'test', 'question', 'attempt', 'notifications'].includes(base)) {
      const actionRaw = parts.join('_');
      if (actionRaw) {
        const action = actionRaw.replace(/_/g, '-');
        command = { ...command, name: base, args: [action, ...command.args] };
      }
    }
  }
  const chatId = update.chat_id;

  if (!command.raw) {
    return invalidCommand();
  }

  if (isCancelCommand(command)) {
    await store.delete(chatId);
    return cancelMessage();
  }

  const state = await store.get(chatId);

  if (!state) {
    if (isActionsCommand(command)) {
      return actionsHelpMessage();
    }
    if (isPermissionsCommand(command)) {
      return permissionsMessage();
    }
    if (isLoginCommand(command)) {
      const loginType = parseLoginType(command);
      if (!loginType) {
        return promptLogin();
      }
      const loginToken = uuidv4();
      if (loginType === 'code') {
        await store.set(chatId, createAnonymousState(loginToken, 'awaiting_confirm'));
        const init = await authClient.initOAuth('confirm', loginToken);
        const code = init.code || init.auth_url;
        if (!code) {
          return invalidCodeMessage('код не был получен');
        }
        return codeGeneratedMessage(code);
      }
      await store.set(chatId, createAnonymousState(loginToken));
      const init = await authClient.initOAuth(loginType, loginToken);
      return { messages: [{ text: `Ссылка для входа: ${init.auth_url}` }] };
    }
    if (command.name === 'help' || command.name === 'start') {
      return helpMessage();
    }
    return promptLogin();
  }

  if (state.status === 'anonymous') {
    if (isCancelCommand(command)) {
      await store.delete(chatId);
      return cancelMessage();
    }
    if (isActionsCommand(command)) {
      return actionsHelpMessage();
    }
    if (isPermissionsCommand(command)) {
      return permissionsMessage();
    }
    if (state.pending_action === 'awaiting_confirm' && isConfirmCode(command)) {
      return pendingMessage();
    }

    if (isLoginCommand(command)) {
      const loginType = parseLoginType(command);
      if (!loginType) {
        return promptLogin();
      }
      const loginToken = uuidv4();
      if (loginType === 'code') {
        await store.set(chatId, createAnonymousState(loginToken, 'awaiting_confirm'));
        const init = await authClient.initOAuth('confirm', loginToken);
        const code = init.code || init.auth_url;
        if (!code) {
          return invalidCodeMessage('код не был получен');
        }
        return codeGeneratedMessage(code);
      }
      await store.set(chatId, createAnonymousState(loginToken));
      const init = await authClient.initOAuth(loginType, loginToken);
      return { messages: [{ text: `Ссылка для входа: ${init.auth_url}` }] };
    }

    if (!state.login_token) {
      await store.delete(chatId);
      return promptLogin();
    }

    const verify = await authClient.verifyLoginToken(state.login_token);
    if (verify.status === 'pending') {
      return pendingMessage();
    }
    if (verify.status === 'denied') {
      await store.delete(chatId);
      return deniedMessage();
    }
    if (verify.status === 'expired') {
      await store.delete(chatId);
      return promptLogin();
    }
    if (isApprovedStatus(verify.status) && verify.access_token && verify.refresh_token) {
      await store.set(chatId, createAuthorizedState(verify.access_token, verify.refresh_token));
      if (command.name === 'help' || command.name === 'start') {
        return approvedMessage();
      }
      return handleAuthorizedCommand(
        command,
        createAuthorizedState(verify.access_token, verify.refresh_token),
        authClient,
        mainClient,
        store,
        chatId
      );
    }
    return pendingMessage();
  }

  return handleAuthorizedCommand(command, state, authClient, mainClient, store, chatId);
};

export const handleAuthCheck = async (
  store: StateStore,
  authClient: AuthClient,
  limit: number
): Promise<Array<{ chatId: string; messages: { text: string }[] }>> => {
  const items = await store.listByStatus('anonymous', limit);
  const results: Array<{ chatId: string; messages: { text: string }[] }> = [];

  for (const item of items) {
    const loginToken = item.state.login_token;
    if (!loginToken) {
      await store.delete(item.chatId);
      continue;
    }
    const verify = await authClient.verifyLoginToken(loginToken);
    if (isApprovedStatus(verify.status) && verify.access_token && verify.refresh_token) {
      await store.set(item.chatId, createAuthorizedState(verify.access_token, verify.refresh_token));
      results.push({ chatId: item.chatId, messages: approvedMessage().messages });
      continue;
    }
    if (verify.status === 'denied') {
      await store.delete(item.chatId);
      results.push({ chatId: item.chatId, messages: deniedMessage().messages });
    }
    if (verify.status === 'expired') {
      await store.delete(item.chatId);
    }
  }

  return results;
};

export const handleNotifications = async (
  store: StateStore,
  authClient: AuthClient,
  mainClient: MainClient,
  limit: number
): Promise<Array<{ chatId: string; messages: { text: string }[] }>> => {
  const items = await store.listByStatus('authorized', limit);
  const results: Array<{ chatId: string; messages: { text: string }[] }> = [];

  for (const item of items) {
    const accessToken = item.state.access_token;
    if (!accessToken) {
      continue;
    }
    try {
      const notifications = await mainClient.getNotifications(accessToken);
      if (notifications.notifications.length > 0) {
        results.push({
          chatId: item.chatId,
          messages: notifications.notifications.map((text) => ({ text }))
        });
        await mainClient.clearNotifications(accessToken);
      }
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        continue;
      }
      const refreshedState = await refreshAuthorizedState(item.state, authClient, store, item.chatId);
      if (!refreshedState) {
        results.push({ chatId: item.chatId, messages: promptLogin().messages });
        continue;
      }
      try {
        const notifications = await mainClient.getNotifications(refreshedState.access_token || '');
        if (notifications.notifications.length > 0) {
          results.push({
            chatId: item.chatId,
            messages: notifications.notifications.map((text) => ({ text }))
          });
          await mainClient.clearNotifications(refreshedState.access_token || '');
        }
      } catch (retryError) {
        if (isUnauthorizedError(retryError)) {
          await store.delete(item.chatId);
          results.push({ chatId: item.chatId, messages: promptLogin().messages });
        }
      }
    }
  }

  return results;
};

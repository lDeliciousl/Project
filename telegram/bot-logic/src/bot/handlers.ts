import { v4 as uuidv4 } from 'uuid';
import { parseCommand } from '../domain/commands';
import { createAnonymousState, createAuthorizedState, UserState } from '../domain/state';
import { BotResponse, Command, LoginType, TelegramUpdate } from '../domain/types';
import { AuthClient } from '../integrations/authClient';
import { MainClient } from '../integrations/mainClient';
import { StateStore } from '../integrations/stateStore';

const LOGIN_TYPES: LoginType[] = ['github', 'yandex', 'code'];

const promptLogin = (): BotResponse => ({
  messages: [
    {
      text:
        'Вы не авторизованы. Используйте /login?type=github|yandex|code для входа.'
    }
  ]
});

const helpMessage = (): BotResponse => ({
  messages: [
    {
      text:
        'Команды: /start, /help, /login?type=github|yandex|code, /logout, /logout all=true, /tests'
    }
  ]
});

const approvedMessage = (): BotResponse => ({
  messages: [{ text: '✅ Авторизация успешна.' }]
});

const deniedMessage = (): BotResponse => ({
  messages: [{ text: '❌ Авторизация отклонена.' }]
});

const pendingMessage = (): BotResponse => ({
  messages: [{ text: '⏳ Ожидаем подтверждение авторизации.' }]
});

const alreadyAuthorized = (): BotResponse => ({
  messages: [{ text: 'Вы уже авторизованы.' }]
});

const loggedOut = (): BotResponse => ({
  messages: [{ text: 'Сеанс завершён.' }]
});

const logoutAll = (): BotResponse => ({
  messages: [{ text: 'Сеанс завершён на всех устройствах.' }]
});

const invalidCommand = (): BotResponse => ({
  messages: [{ text: 'Нет такой команды. Используйте /help.' }]
});

const isLoginCommand = (command: Command) => command.name === 'login';

const isLogoutCommand = (command: Command) => command.name === 'logout';

const parseLoginType = (command: Command): LoginType | null => {
  const type = command.params.type || command.args[0];
  if (!type) {
    return null;
  }
  const normalized = type.toLowerCase();
  return LOGIN_TYPES.includes(normalized as LoginType) ? (normalized as LoginType) : null;
};

const handleAuthorizedCommand = async (
  command: Command,
  state: UserState,
  authClient: AuthClient,
  mainClient: MainClient,
  store: StateStore,
  chatId: string
): Promise<BotResponse> => {
  if (isLoginCommand(command)) {
    return alreadyAuthorized();
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

  if (command.name === 'tests') {
    const data = await mainClient.getTests(state.access_token || '');
    return { messages: [{ text: `Доступные тесты: ${JSON.stringify(data)}` }] };
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
  const command = parseCommand(update.text || '');
  const chatId = update.chat_id;

  if (!command.raw) {
    return invalidCommand();
  }

  const state = await store.get(chatId);

  if (!state) {
    if (isLoginCommand(command)) {
      const loginType = parseLoginType(command);
      if (!loginType) {
        return promptLogin();
      }
      const loginToken = uuidv4();
      await store.set(chatId, createAnonymousState(loginToken));
      const init = await authClient.initOAuth(loginType, loginToken);
      if (init.code) {
        return { messages: [{ text: `Код для входа: ${init.code}` }] };
      }
      return { messages: [{ text: `Ссылка для входа: ${init.auth_url}` }] };
    }
    if (command.name === 'help' || command.name === 'start') {
      return helpMessage();
    }
    return promptLogin();
  }

  if (state.status === 'anonymous') {
    if (isLoginCommand(command)) {
      const loginType = parseLoginType(command);
      if (!loginType) {
        return promptLogin();
      }
      const loginToken = uuidv4();
      await store.set(chatId, createAnonymousState(loginToken));
      const init = await authClient.initOAuth(loginType, loginToken);
      if (init.code) {
        return { messages: [{ text: `Код для входа: ${init.code}` }] };
      }
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
    if (verify.status === 'denied' || verify.status === 'expired') {
      await store.delete(chatId);
      return deniedMessage();
    }
    if (verify.status === 'approved' && verify.access_token && verify.refresh_token) {
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
    if (verify.status === 'approved' && verify.access_token && verify.refresh_token) {
      await store.set(item.chatId, createAuthorizedState(verify.access_token, verify.refresh_token));
      results.push({ chatId: item.chatId, messages: approvedMessage().messages });
      continue;
    }
    if (verify.status === 'denied' || verify.status === 'expired') {
      await store.delete(item.chatId);
      results.push({ chatId: item.chatId, messages: deniedMessage().messages });
    }
  }

  return results;
};

export const handleNotifications = async (
  store: StateStore,
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
    const notifications = await mainClient.getNotifications(accessToken);
    if (notifications.notifications.length > 0) {
      results.push({
        chatId: item.chatId,
        messages: notifications.notifications.map((text) => ({ text }))
      });
      await mainClient.clearNotifications(accessToken);
    }
  }

  return results;
};

import { v4 as uuidv4 } from 'uuid';
import { parseCommand } from '../domain/commands';
import {
  createAnonymousState,
  createAuthorizedState,
  TestFlowQuestion,
  TestFlowState,
  UserState
} from '../domain/state';
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

const FLOW_OPTION_ROWS = 2;

const normalizeTestQuestions = (payload: any): TestFlowQuestion[] => {
  const rawQuestions = payload?.questions;
  if (!Array.isArray(rawQuestions)) {
    return [];
  }
  return rawQuestions
    .map((question: any) => {
      const options = Array.isArray(question?.options)
        ? question.options
            .map((option: any) => ({
              id: String(option?.id ?? ''),
              text: String(option?.text ?? '')
            }))
            .filter((option: { id: string; text: string }) => option.id && option.text)
        : [];
      return {
        id: String(question?.id ?? ''),
        text: String(question?.text ?? ''),
        options
      };
    })
    .filter((question: TestFlowQuestion) => question.id && question.text && question.options.length > 0);
};

const buildOptionKeyboard = (optionsCount: number): string[][] => {
  const rows: string[][] = [];
  for (let i = 0; i < optionsCount; i += FLOW_OPTION_ROWS) {
    rows.push(
      Array.from({ length: Math.min(FLOW_OPTION_ROWS, optionsCount - i) }, (_, index) =>
        String(i + index + 1)
      )
    );
  }
  rows.push(['Следующий', 'Завершить']);
  return rows;
};

const buildQuestionMessage = (flow: TestFlowState): BotResponse => {
  const question = flow.questions[flow.current_index];
  if (!question) {
    return {
      messages: [
        {
          text: 'Вопросы закончились. Нажмите «Завершить» или выполните /test_finish.',
          options: { reply_markup: { keyboard: [['Завершить']], resize_keyboard: true } }
        }
      ]
    };
  }
  const optionsText = question.options
    .map((option, index) => `${index + 1}) ${option.text}`)
    .join('\n');
  const text = [
    `Попытка: ${flow.attempt_id}`,
    `🧪 Вопрос ${flow.current_index + 1}/${flow.questions.length}`,
    question.text,
    '',
    optionsText
  ].join('\n');
  return {
    messages: [
      {
        text,
        options: {
          disable_web_page_preview: true,
          reply_markup: {
            keyboard: buildOptionKeyboard(question.options.length),
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      }
    ]
  };
};

const parseOptionIndex = (text: string): number | null => {
  const normalized = text.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

const isNextText = (text: string): boolean =>
  ['следующий', 'далее', 'next'].includes(text.trim().toLowerCase());

const isFinishText = (text: string): boolean =>
  ['завершить', 'finish', 'закончить'].includes(text.trim().toLowerCase());

const clearTestFlow = async (state: UserState, store: StateStore, chatId: string) => {
  if (!state.test_flow) {
    return;
  }
  await store.set(chatId, {
    ...state,
    test_flow: undefined,
    updated_at: new Date().toISOString()
  });
};

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
    const nextState: UserState = {
      ...createAuthorizedState(tokens.access_token, tokens.refresh_token),
      test_flow: state.test_flow
    };
    await store.set(chatId, nextState);
    return nextState;
  } catch {
    await store.delete(chatId);
    return null;
  }
};

const buildTestFlowState = (
  testId: string,
  attemptId: string,
  questions: TestFlowQuestion[]
): TestFlowState => ({
  test_id: testId,
  attempt_id: attemptId,
  current_index: 0,
  questions,
  updated_at: new Date().toISOString()
});

const handleTestStart = async (
  command: Command,
  state: UserState,
  mainClient: MainClient,
  store: StateStore,
  chatId: string
): Promise<BotResponse> => {
  const testId = command.args[1] || command.args[0];
  if (!testId) {
    return {
      messages: [{ text: 'Нужен test_id. Пример: /test_start <test_id>' }]
    };
  }
  if (!state.access_token) {
    return promptLogin();
  }
  try {
    const attempt = await mainClient.createTestAttempt(state.access_token, { test_id: testId });
    const attemptId =
      (attempt as any)?.attempt_id ||
      (attempt as any)?.attemptId ||
      (attempt as any)?.id ||
      '';
    const attemptIdString = attemptId ? String(attemptId) : '';
    if (!attemptIdString) {
      return {
        messages: [{ text: 'Не удалось создать попытку. Попробуйте позже.' }]
      };
    }
    const test = await mainClient.getTestDetails(state.access_token, testId);
    const questions = normalizeTestQuestions(test);
    if (questions.length === 0) {
      await clearTestFlow(state, store, chatId);
      return {
        messages: [
          {
            text: 'В тесте нет вопросов. Попробуйте позже.',
            options: { reply_markup: { remove_keyboard: true } }
          }
        ]
      };
    }
    const flow = buildTestFlowState(testId, attemptIdString, questions);
    await store.set(chatId, { ...state, test_flow: flow, updated_at: new Date().toISOString() });
    return buildQuestionMessage(flow);
  } catch (error) {
    const detail = extractErrorDetail(error);
    return {
      messages: [{ text: detail ? `Ошибка: ${detail}` : 'Не удалось начать тест.' }]
    };
  }
};

const advanceFlow = async (
  state: UserState,
  store: StateStore,
  chatId: string,
  messagePrefix?: string
): Promise<BotResponse> => {
  if (!state.test_flow) {
    return invalidCommand();
  }
  const nextIndex = state.test_flow.current_index + 1;
  if (nextIndex >= state.test_flow.questions.length) {
    await store.set(chatId, {
      ...state,
      test_flow: { ...state.test_flow, current_index: nextIndex, updated_at: new Date().toISOString() },
      updated_at: new Date().toISOString()
    });
    return {
      messages: [
        {
          text: `${messagePrefix ? `${messagePrefix}\n` : ''}Вопросы закончились. Нажмите «Завершить».`,
          options: {
            reply_markup: { keyboard: [['Завершить']], resize_keyboard: true, one_time_keyboard: true }
          }
        }
      ]
    };
  }
  const updatedFlow = {
    ...state.test_flow,
    current_index: nextIndex,
    updated_at: new Date().toISOString()
  };
  await store.set(chatId, { ...state, test_flow: updatedFlow, updated_at: new Date().toISOString() });
  const questionMessage = buildQuestionMessage(updatedFlow);
  if (!messagePrefix) {
    return questionMessage;
  }
  return {
    messages: [{ text: messagePrefix }, ...questionMessage.messages]
  };
};

const handleTestAnswer = async (
  command: Command,
  state: UserState,
  mainClient: MainClient,
  store: StateStore,
  chatId: string
): Promise<BotResponse> => {
  const hasAction = command.args[0] === 'answer';
  const offset = hasAction ? 1 : 0;
  const attemptId = command.args[offset];
  const questionId = command.args[offset + 1];
  const optionId = command.args[offset + 2];
  if (!attemptId || !questionId || !optionId) {
    return { messages: [{ text: 'Нужно: /test_answer <attempt_id> <question_id> <option_id>' }] };
  }
  if (!state.access_token) {
    return promptLogin();
  }
  try {
    await mainClient.createAnswer(state.access_token, attemptId, questionId, optionId);
  } catch (error) {
    const detail = extractErrorDetail(error);
    if (detail && detail.toLowerCase().includes('attempt not found')) {
      await clearTestFlow(state, store, chatId);
      return {
        messages: [
          {
            text: 'Попытка не найдена. Запустите тест снова: /test_start <test_id>'
          }
        ]
      };
    }
    return {
      messages: [{ text: detail ? `Ошибка: ${detail}` : 'Не удалось сохранить ответ.' }]
    };
  }
  if (!state.test_flow || state.test_flow.attempt_id !== attemptId) {
    return { messages: [{ text: 'Ответ сохранён.' }] };
  }
  return advanceFlow(state, store, chatId, 'Ответ сохранён.');
};

const handleTestFinish = async (
  command: Command,
  state: UserState,
  mainClient: MainClient,
  store: StateStore,
  chatId: string
): Promise<BotResponse> => {
  const attemptId = command.args[1] || command.args[0] || state.test_flow?.attempt_id;
  if (!attemptId) {
    return { messages: [{ text: 'Нужен attempt_id. Пример: /test_finish <attempt_id>' }] };
  }
  if (!state.access_token) {
    return promptLogin();
  }
  try {
    const result = await mainClient.finishAttempt(state.access_token, attemptId);
    const score = (result as any)?.score;
    const maxScore = (result as any)?.max_score;
    const scoreLine =
      Number.isFinite(Number(score)) && Number.isFinite(Number(maxScore))
        ? `Баллы: ${Number(score)}/${Number(maxScore)}`
        : '';
    await clearTestFlow(state, store, chatId);
    return {
      messages: [
        {
          text: ['Попытка завершена.', scoreLine].filter(Boolean).join('\n'),
          options: { reply_markup: { remove_keyboard: true } }
        }
      ]
    };
  } catch (error) {
    const detail = extractErrorDetail(error);
    return {
      messages: [{ text: detail ? `Ошибка: ${detail}` : 'Не удалось завершить попытку.' }]
    };
  }
};

const handleTestNext = async (
  state: UserState,
  store: StateStore,
  chatId: string
): Promise<BotResponse> => {
  if (!state.test_flow) {
    return { messages: [{ text: 'Нет активного теста. Используйте /test_start.' }] };
  }
  return advanceFlow(state, store, chatId);
};

const handleTestTextInput = async (
  command: Command,
  state: UserState,
  mainClient: MainClient,
  store: StateStore,
  chatId: string
): Promise<BotResponse | null> => {
  if (!state.test_flow) {
    return null;
  }
  const text = command.args[0] || '';
  if (isFinishText(text)) {
    return handleTestFinish({ ...command, args: [state.test_flow.attempt_id] }, state, mainClient, store, chatId);
  }
  if (isNextText(text)) {
    return handleTestNext(state, store, chatId);
  }
  const optionIndex = parseOptionIndex(text);
  if (!optionIndex) {
    return null;
  }
  const question = state.test_flow.questions[state.test_flow.current_index];
  if (!question) {
    return null;
  }
  const option = question.options[optionIndex - 1];
  if (!option) {
    return {
      messages: [{ text: 'Такого варианта нет. Выберите номер из списка.' }]
    };
  }
  return handleTestAnswer(
    { ...command, args: [state.test_flow.attempt_id, question.id, option.id] },
    state,
    mainClient,
    store,
    chatId
  );
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

  if (command.name === 'test') {
    const action = command.args[0];
    if (action === 'start') {
      return handleTestStart(command, state, mainClient, store, chatId);
    }
    if (action === 'answer') {
      return handleTestAnswer(command, state, mainClient, store, chatId);
    }
    if (action === 'finish') {
      return handleTestFinish(command, state, mainClient, store, chatId);
    }
    if (action === 'next') {
      return handleTestNext(state, store, chatId);
    }
  }

  if (command.name === 'text') {
    const flowResponse = await handleTestTextInput(command, state, mainClient, store, chatId);
    if (flowResponse) {
      return flowResponse;
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
    if (command.name === 'attempt' && command.args[0] === 'finish' && state.test_flow) {
      const attemptId = command.args[1];
      if (attemptId && attemptId === state.test_flow.attempt_id) {
        await clearTestFlow(state, store, chatId);
        return {
          messages: [
            ...actionResponse.messages,
            { text: 'Клавиатура скрыта.', options: { reply_markup: { remove_keyboard: true } } }
          ]
        };
      }
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
  if (command.name === 'answer' && command.args.length >= 3) {
    command = { ...command, name: 'test', args: ['answer', ...command.args] };
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

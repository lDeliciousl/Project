import { BotResponse, Command } from '../domain/types';
import { MainClient } from '../integrations/mainClient';

const actionSections: string[] = [
  [
    'Все данные вводятся через пробелы.',
    'Название и описание с пробелами пишите в кавычках.',
    'Например: /test_create "Название теста" "Описание теста" <course_id> <created_by>'
  ].join('\n'),
  [
    '👤 Пользователи:',
    '• /users — список пользователей',
    '• /user_name <user_id> — ФИО пользователя',
    '• /user_set_name <user_id> <full_name> — обновить ФИО',
    '• /user_courses <user_id> — курсы пользователя',
    '• /user_grades <user_id> — оценки пользователя',
    '• /user_tests <user_id> — тесты пользователя',
    '• /user_roles <user_id> — роли пользователя',
    '• /user_set_roles <user_id> <json_roles> — обновить роли (пример: ["student","teacher"])',
    '• /user_block <user_id> — статус блокировки',
    '• /user_set_block <user_id> <true|false> — блок/разблок',
    '• /user_add <json_body> — создать пользователя'
  ].join('\n'),
  [
    '📚 Курсы:',
    '• /courses — список курсов',
    '• /course <course_id> — информация о курсе',
    '• /course_create <json_body> — создать курс',
    '• /course_update <course_id> <json_body> — обновить курс',
    '• /course_delete <course_id> — удалить курс',
    '• /course_students <course_id> — студенты курса',
    '• /course_tests <course_id> — тесты курса',
    '• /course_enroll <course_id> [user_id] — записать на курс',
    '• /course_unenroll <course_id> <user_id> — отчислить с курса'
  ].join('\n'),
  [
    '🧪 Тесты:',
    '• /tests — список тестов',
    '• /test <test_id> — информация о тесте',
    '• /test_start <test_id> — начать прохождение',
    '  ↳ после запуска бот пишет: "Попытка: <attempt_id>"',
    '• /test_answer <attempt_id> <question_id> <option_id> — ответить',
    '• /test_finish <attempt_id> — завершить попытку',
    '• /test_next — следующий вопрос',
    '• /test_create <json_body> — создать тест',
    '• /test_activate <test_id> <true|false> — активировать/деактивировать',
    '• /test_add_question <test_id> <question_id> — добавить вопрос',
    '• /test_remove_question <test_id> <question_id> — удалить вопрос',
    '• /attempt <attempt_id> — информация о попытке'
  ].join('\n'),
  [
    '❓ Вопросы:',
    '• /questions — список вопросов',
    '• /question <question_id> — информация о вопросе',
    '• /question_create <json_body> — создать вопрос',
    '• /question_update <question_id> <json_body> — обновить вопрос',
    '• /question_delete <question_id> — удалить вопрос'
  ].join('\n'),
  [
    '🔔 Уведомления:',
    '• /notifications — список уведомлений',
    '• /notifications_clear — очистить уведомления'
  ].join('\n'),
  // JSON examples removed per request
];

const baseMessageOptions = {
  disable_web_page_preview: true
};

export const actionsHelpMessage = (): BotResponse => ({
  messages: [
    {
      text: '📌 Справка по командам\nВыберите нужный раздел ниже.',
      options: baseMessageOptions
    },
    ...actionSections.map((text) => ({ text, options: baseMessageOptions }))
  ]
});

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const formatInlineCode = (value: unknown): string => {
  const text = escapeHtml(formatValue(value));
  return `<code>${text}</code>`;
};

const LABELS: Record<string, string> = {
  id: 'ID',
  user_id: 'ID пользователя',
  external_id: 'Внешний ID',
  email: 'Email',
  name: 'Имя',
  text: 'Text',
  full_name: 'ФИО',
  first_name: 'Имя',
  last_name: 'Фамилия',
  roles: 'Роли',
  is_blocked: 'Блокировка',
  status: 'Статус',
  title: 'Заголовок',
  description: 'Описание',
  teacher_id: 'ID преподавателя',
  teacher_name: 'Преподаватель',
  teacher_external_id: 'Внешний ID преподавателя',
  course_id: 'ID курса',
  test_id: 'ID теста',
  attempt_id: 'ID попытки',
  question_id: 'ID вопроса',
  answer_id: 'ID ответа',
  option_id: 'ID варианта ответа',
  options: 'Варианты ответа',
  points: 'Баллы',
  version: 'Версия',
  type: 'Тип',
  questions: 'Вопросы',
  tests: 'Тесты',
  courses: 'Курсы',
  grades: 'Оценки',
  notifications: 'Уведомления',
  students: 'Студенты',
  users: 'Пользователи',
  created_at: 'Создано',
  updated_at: 'Обновлено',
  created_by: 'Создал'
};

const formatKeyLabel = (key: string): string => LABELS[key] || key;

const formatObjectLines = (obj: Record<string, unknown>, indent = ''): string[] =>
  Object.entries(obj).flatMap(([key, value]) => {
    const label = formatKeyLabel(key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return [`${indent}${label}:`, ...formatObjectLines(value as Record<string, unknown>, `${indent}  `)];
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return [`${indent}${label}: []`];
      }
      if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
        return [
          `${indent}${label}:`,
          ...value.flatMap((item, index) => [
            `${indent}  ${index + 1})`,
            ...formatObjectLines(item as Record<string, unknown>, `${indent}    `)
          ])
        ];
      }
      const joined = value.map((item) => formatInlineCode(item)).join(', ');
      return [`${indent}${label}: ${joined}`];
    }
    return [`${indent}${label}: ${formatInlineCode(value)}`];
  });

const formatPayloadLines = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object') {
    return [formatValue(payload)];
  }

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return ['[]'];
    }
    if (payload.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      return payload.flatMap((item, index) => [
        `${index + 1})`,
        ...formatObjectLines(item as Record<string, unknown>, '  ')
      ]);
    }
    return payload.map((item, index) => `${index + 1}) ${formatInlineCode(item)}`);
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 1 && Array.isArray(entries[0][1])) {
    const [key, value] = entries[0];
    const label = formatKeyLabel(key);
    const arrayValue = value as unknown[];
    if (arrayValue.length === 0) {
      return [`${label}: []`];
    }
    if (arrayValue.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      return [
        `${label}:`,
        ...arrayValue.flatMap((item, index) => [
          `  ${index + 1})`,
          ...formatObjectLines(item as Record<string, unknown>, '    ')
        ])
      ];
    }
    return [`${label}: ${arrayValue.map((item) => formatInlineCode(item)).join(', ')}`];
  }

  return formatObjectLines(payload as Record<string, unknown>);
};

const formatResponse = (title: string, payload: unknown): BotResponse => {
  const lines = formatPayloadLines(payload).join('\n');
  return {
    messages: [
      {
        text: `${title}:\n${lines}`,
        options: { ...baseMessageOptions, parse_mode: 'HTML' }
      }
    ]
  };
};

const errorResponse = (message: string, requiresReauth = false): BotResponse => ({
  messages: [{ text: `⚠️ ${message}`, options: baseMessageOptions }],
  ...(requiresReauth ? { requires_reauth: true } : {})
});

const parseJsonPayload = (raw: string | undefined): { ok: true; value: any } | { ok: false; error: string } => {
  if (!raw) {
    return { ok: false, error: 'Нужен JSON-параметр.' };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: 'Некорректный JSON.' };
  }
};

const missingFields = (payload: unknown, required: string[]): string[] => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return required;
  }
  return required.filter((key) => {
    if (!(key in (payload as Record<string, unknown>))) {
      return true;
    }
    const value = (payload as Record<string, unknown>)[key];
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
      return true;
    }
    if (Array.isArray(value) && value.length === 0) {
      return true;
    }
    return false;
  });
};

const FIELD_HINTS: Record<string, string> = {
  json_body: 'введите JSON после команды',
  user_id: 'получить: /users',
  course_id: 'получить: /courses',
  test_id: 'получить: /tests',
  question_id: 'получить: /questions',
  attempt_id: 'получить: /test_start <test_id> (бот пишет attempt_id) или /attempt <attempt_id>',
  answer_id: 'получить: /attempt <attempt_id>',
  option_id: 'получить: /question <question_id> (ID варианта ответа)',
  options: 'перечень вариантов ответа',
  roles: 'пример: ["student","teacher"]',
  teacher_id: 'получить: /users',
  created_by: 'получить: /users',
  name: 'придумайте сами',
  description: 'придумайте сами',
  text: 'придумайте сами',
  type: 'например: single_choice',
  points: 'например: 1'
};

const missingArgsMessage = (missing: string[]): BotResponse => {
  const lines = missing.map((key) => {
    const hint = FIELD_HINTS[key];
    const label = formatKeyLabel(key);
    return hint ? `${label}: ${hint}` : label;
  });
  return errorResponse(`Не хватает данных: ${lines.join('; ')}`);
};

const jsonArgsMessage = (commandText: string, fields: string[], issue?: string): BotResponse => {
  const lines = fields.map((key) => {
    const hint = FIELD_HINTS[key];
    const label = formatKeyLabel(key);
    return hint ? `${label}: ${hint}` : label;
  });
  const issueText = issue ? `Проблема с JSON: ${issue}.` : '';
  return errorResponse(
    [issueText, 'Не хватает данных:', ...lines].filter(Boolean).join('\n')
  );
};

const parseOptionsTokens = (tokens: string[]): Array<{ text: string }> => {
  const options: Array<{ text: string }> = [];

  if (tokens.length === 1 && tokens[0].includes(',')) {
    const parts = tokens[0].split(',').map((part) => part.trim()).filter(Boolean);
    return parts.map((text) => ({ text }));
  }

  let current: { text: string } | null = null;

  const flush = () => {
    if (current && current.text.trim().length > 0) {
      options.push({ text: current.text.trim() });
    }
  };

  for (const token of tokens) {
    const match = token.match(/^(\d+):(.*)$/);
    if (match) {
      flush();
      const initialText = match[2] || '';
      current = { text: initialText };
      continue;
    }
    if (!current) {
      current = { text: token };
      continue;
    }
    current.text = current.text ? `${current.text} ${token}` : token;
  }

  flush();
  return options;
};

const buildQuestionPayloadFromArgs = (args: string[]): Record<string, unknown> | null => {
  if (args.length < 3) {
    return null;
  }
  const text = args[0];
  let type = 'single_choice';
  let pointsIndex = 1;
  if (Number.isNaN(Number(args[1]))) {
    type = args[1];
    pointsIndex = 2;
  }
  const points = Number(args[pointsIndex]);
  if (!Number.isFinite(points)) {
    return null;
  }
  const optionsTokens = args.slice(pointsIndex + 1);
  const options = parseOptionsTokens(optionsTokens);
  return { text, type, points, options };
};

const buildPayloadFromArgs = (
  commandText: string,
  args: string[]
): Record<string, string> | null => {
  if (commandText === '/test_create <json_body>' && args.length >= 4) {
    return {
      name: args[0],
      description: args[1],
      course_id: args[2],
      created_by: args[3]
    };
  }
  if (commandText === '/course_create <json_body>' && args.length >= 3) {
    return {
      name: args[0],
      description: args[1],
      teacher_id: args[2]
    };
  }
  return null;
};

const buildAttemptPayloadFromArgs = (args: string[]): Record<string, string> | null => {
  if (args.length < 1) {
    return null;
  }
  return {
    test_id: args[0]
  };
};

const joinArgs = (args: string[], startIndex: number): string | undefined => {
  if (args.length <= startIndex) {
    return undefined;
  }
  return args.slice(startIndex).join(' ');
};

const parseBoolean = (value: string | undefined): boolean | null => {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes', 'да'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'нет'].includes(normalized)) {
    return false;
  }
  return null;
};

const isNotFoundError = (error: any): boolean => error?.response?.status === 404;

const handleError = (error: any): BotResponse => {
  const status = error?.response?.status;
  const detail =
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message;
  if (status === 401) {
    return errorResponse('Доступ запрещён: нужна авторизация.', true);
  }
  if (status === 403) {
    return errorResponse('Недостаточно прав для этого действия.');
  }
  if (status === 404) {
    return errorResponse('Ресурс не найден.');
  }
  return errorResponse(detail ? `Ошибка: ${detail}` : 'Ошибка при обращении к главному модулю.');
};

export const handleActionCommand = async (
  command: Command,
  accessToken: string,
  mainClient: MainClient
): Promise<BotResponse | null> => {
  try {
    if (command.name === 'users') {
      const data = await mainClient.getUsers(accessToken);
      return formatResponse('Пользователи', data);
    }

    if (command.name === 'user') {
      const action = command.args[0];
      const userId = command.args[1];
      if (!action) {
        return missingArgsMessage(['action', 'user_id']);
      }
      if (action === 'name' && userId) {
        const data = await mainClient.getUserName(accessToken, userId);
        return formatResponse('ФИО пользователя', data);
      }
      if (action === 'name' && !userId) {
        return missingArgsMessage(['user_id']);
      }
      if (action === 'set-name' && userId) {
        const name = joinArgs(command.args, 2);
        if (!name) {
          return missingArgsMessage(['full_name']);
        }
        const data = await mainClient.setUserName(accessToken, userId, name);
        return formatResponse('ФИО обновлено', data);
      }
      if (action === 'set-name' && !userId) {
        return missingArgsMessage(['user_id']);
      }
      if (action === 'courses' && userId) {
        const data = await mainClient.getUserCourses(accessToken, userId);
        return formatResponse('Курсы пользователя', data);
      }
      if (action === 'courses' && !userId) {
        return missingArgsMessage(['user_id']);
      }
      if (action === 'grades' && userId) {
        const data = await mainClient.getUserGrades(accessToken, userId);
        return formatResponse('Оценки пользователя', data);
      }
      if (action === 'grades' && !userId) {
        return missingArgsMessage(['user_id']);
      }
      if (action === 'tests' && userId) {
        const data = await mainClient.getUserTests(accessToken, userId);
        return formatResponse('Тесты пользователя', data);
      }
      if (action === 'tests' && !userId) {
        return missingArgsMessage(['user_id']);
      }
      if (action === 'roles' && userId) {
        const data = await mainClient.getUserRoles(accessToken, userId);
        return formatResponse('Роли пользователя', data);
      }
      if (action === 'roles' && !userId) {
        return missingArgsMessage(['user_id']);
      }
      if (action === 'set-roles' && userId) {
        const payload = parseJsonPayload(joinArgs(command.args, 2));
        if (!payload.ok) {
          return jsonArgsMessage('/user_set_roles <user_id> <json_roles>', ['json_roles'], payload.error);
        }
        if (!Array.isArray(payload.value)) {
          return errorResponse('Нужен JSON-массив ролей.');
        }
        const data = await mainClient.setUserRoles(accessToken, userId, payload.value);
        return formatResponse('Роли обновлены', data);
      }
      if (action === 'set-roles' && !userId) {
        return missingArgsMessage(['user_id', 'json_roles']);
      }
      if (action === 'block' && userId) {
        const data = await mainClient.getUserBlocked(accessToken, userId);
        return formatResponse('Статус блокировки', data);
      }
      if (action === 'block' && !userId) {
        return missingArgsMessage(['user_id']);
      }
      if (action === 'set-block' && userId) {
        const flag = parseBoolean(command.args[2]);
        if (flag === null) {
          return missingArgsMessage(['true|false']);
        }
        const data = await mainClient.setUserBlocked(accessToken, userId, flag);
        return formatResponse('Статус блокировки обновлён', data);
      }
      if (action === 'set-block' && !userId) {
        return missingArgsMessage(['user_id', 'true|false']);
      }
      if (action === 'add') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          return jsonArgsMessage(
            '/user_add <json_body>',
            ['json_body', 'email', 'full_name', 'roles'],
            payload.error
          );
        }
        const missing = missingFields(payload.value, ['email', 'full_name', 'roles']);
        if (missing.length > 0) {
          return missingArgsMessage(missing);
        }
        const data = await mainClient.addUser(accessToken, payload.value);
        return formatResponse('Пользователь создан', data);
      }
      return errorResponse('Неизвестное действие для /user.');
    }

    if (command.name === 'courses') {
      const data = await mainClient.getCourses(accessToken);
      return formatResponse('Курсы', data);
    }

    if (command.name === 'course') {
      const action = command.args[0];
      const courseId = command.args[1];
      if (!action) {
        return missingArgsMessage(['course_id']);
      }
      if (!courseId && action !== 'create') {
        return missingArgsMessage(['course_id']);
      }
      if (action === 'create') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          const altPayload = buildPayloadFromArgs('/course_create <json_body>', command.args.slice(1));
          if (altPayload) {
            const missing = missingFields(altPayload, ['name', 'description', 'teacher_id']);
            if (missing.length > 0) {
              return missingArgsMessage(missing);
            }
            const data = await mainClient.createCourse(accessToken, altPayload);
            return formatResponse('Курс создан', data);
          }
          return jsonArgsMessage(
            '/course_create <json_body>',
            ['json_body', 'name', 'description', 'teacher_id'],
            payload.error
          );
        }
        const missing = missingFields(payload.value, ['name', 'description', 'teacher_id']);
        if (missing.length > 0) {
          return missingArgsMessage(missing);
        }
        const data = await mainClient.createCourse(accessToken, payload.value);
        return formatResponse('Курс создан', data);
      }
      if (action === 'update' && courseId) {
        const payload = parseJsonPayload(joinArgs(command.args, 2));
        if (!payload.ok) {
          return jsonArgsMessage(
            '/course_update <course_id> <json_body>',
            ['json_body', 'name', 'description', 'teacher_id'],
            payload.error
          );
        }
        const missing = missingFields(payload.value, ['name', 'description', 'teacher_id']);
        if (missing.length > 0) {
          return missingArgsMessage(missing);
        }
        const data = await mainClient.updateCourse(accessToken, courseId, payload.value);
        return formatResponse('Курс обновлён', data);
      }
      if (action === 'delete' && courseId) {
        const data = await mainClient.deleteCourse(accessToken, courseId);
        return formatResponse('Курс удалён', data);
      }
      if (action === 'students' && courseId) {
        const data = await mainClient.getCourseStudents(accessToken, courseId);
        return formatResponse('Студенты курса', data);
      }
      if (action === 'tests' && courseId) {
        const data = await mainClient.getCourseTests(accessToken, courseId);
        return formatResponse('Тесты курса', data);
      }
      if (action === 'enroll' && courseId) {
        const targetUserId = command.args[2];
        const data = await mainClient.enrollCourse(accessToken, courseId, targetUserId);
        return formatResponse('Запись на курс', data);
      }
      if (action === 'unenroll' && courseId) {
        const targetUserId = command.args[2];
        if (!targetUserId) {
          return missingArgsMessage(['user_id']);
        }
        const data = await mainClient.unenrollCourse(accessToken, courseId, targetUserId);
        return formatResponse('Отчисление с курса', data);
      }
      if (!action.includes('-')) {
        const data = await mainClient.getCourseInfo(accessToken, action);
        return formatResponse('Информация о курсе', data);
      }
      return errorResponse('Неизвестное действие для /course.');
    }

    if (command.name === 'tests') {
      const data = await mainClient.getTests(accessToken);
      return formatResponse('Список тестов', data);
    }

    if (command.name === 'test') {
      const action = command.args[0];
      const testId = command.args[1];
      if (!action) {
        return missingArgsMessage(['test_id']);
      }
      if (action === 'create') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          const altPayload = buildPayloadFromArgs('/test_create <json_body>', command.args.slice(1));
          if (altPayload) {
            const missing = missingFields(altPayload, ['name', 'description', 'course_id', 'created_by']);
            if (missing.length > 0) {
              return missingArgsMessage(missing);
            }
            const data = await mainClient.createTest(accessToken, altPayload);
            return formatResponse('Тест создан', data);
          }
          return jsonArgsMessage(
            '/test_create <json_body>',
            ['json_body', 'name', 'description', 'course_id', 'created_by'],
            payload.error
          );
        }
        const missing = missingFields(payload.value, ['name', 'description', 'course_id', 'created_by']);
        if (missing.length > 0) {
          return missingArgsMessage(missing);
        }
        const data = await mainClient.createTest(accessToken, payload.value);
        return formatResponse('Тест создан', data);
      }
      if (action === 'activate' && testId) {
        const flag = parseBoolean(command.args[2]);
        if (flag === null) {
          return missingArgsMessage(['true|false']);
        }
        const data = await mainClient.activateTest(accessToken, testId, flag);
        return formatResponse('Статус теста обновлён', data);
      }
      if (action === 'activate' && !testId) {
        return missingArgsMessage(['test_id', 'true|false']);
      }
      if (action === 'add-question' && testId) {
        const questionId = command.args[2];
        if (!questionId) {
          return missingArgsMessage(['question_id']);
        }
        const data = await mainClient.addQuestionToTest(accessToken, testId, questionId);
        return formatResponse('Вопрос добавлен в тест', data);
      }
      if (action === 'add-question' && !testId) {
        return missingArgsMessage(['test_id', 'question_id']);
      }
      if (action === 'remove-question' && testId) {
        const questionId = command.args[2];
        if (!questionId) {
          return missingArgsMessage(['question_id']);
        }
        const data = await mainClient.removeQuestionFromTest(accessToken, testId, questionId);
        return formatResponse('Вопрос удалён из теста', data);
      }
      if (action === 'remove-question' && !testId) {
        return missingArgsMessage(['test_id', 'question_id']);
      }
      if (!action.includes('-')) {
        const data = await mainClient.getTestDetails(accessToken, action);
        return formatResponse('Детали теста', data);
      }
      return errorResponse('Неизвестное действие для /test.');
    }

    if (command.name === 'questions') {
      const data = await mainClient.getQuestions(accessToken);
      return formatResponse('Вопросы', data);
    }

    if (command.name === 'question') {
      const action = command.args[0];
      const questionId = command.args[1];
      if (!action) {
        return missingArgsMessage(['question_id']);
      }
      if (action === 'create') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          const altPayload = buildQuestionPayloadFromArgs(command.args.slice(1));
          if (altPayload) {
            const missing = missingFields(altPayload, ['text', 'type', 'points', 'options']);
            if (missing.length > 0) {
              return missingArgsMessage(missing);
            }
            const data = await mainClient.createQuestion(accessToken, altPayload);
            return formatResponse('Вопрос создан', data);
          }
          return jsonArgsMessage(
            '/question_create <json_body>',
            ['json_body', 'text', 'type', 'points', 'options'],
            payload.error
          );
        }
        const missing = missingFields(payload.value, ['text', 'type', 'points', 'options']);
        if (missing.length > 0) {
          return missingArgsMessage(missing);
        }
        const data = await mainClient.createQuestion(accessToken, payload.value);
        return formatResponse('Вопрос создан', data);
      }
      if (action === 'update' && questionId) {
        const payload = parseJsonPayload(joinArgs(command.args, 2));
        if (!payload.ok) {
          const altPayload = buildQuestionPayloadFromArgs(command.args.slice(2));
          if (altPayload) {
            const missing = missingFields(altPayload, ['text', 'type', 'points', 'options']);
            if (missing.length > 0) {
              return missingArgsMessage(missing);
            }
            const data = await mainClient.updateQuestion(accessToken, questionId, altPayload);
            return formatResponse('Вопрос обновлён', data);
          }
          return jsonArgsMessage(
            '/question_update <question_id> <json_body>',
            ['json_body', 'text', 'type', 'points', 'options'],
            payload.error
          );
        }
        const missing = missingFields(payload.value, ['text', 'type', 'points', 'options']);
        if (missing.length > 0) {
          return missingArgsMessage(missing);
        }
        const data = await mainClient.updateQuestion(accessToken, questionId, payload.value);
        return formatResponse('Вопрос обновлён', data);
      }
      if (action === 'update' && !questionId) {
        return missingArgsMessage(['question_id', 'json_body']);
      }
      if (action === 'delete' && questionId) {
        const data = await mainClient.deleteQuestion(accessToken, questionId);
        return formatResponse('Вопрос удалён', data);
      }
      if (action === 'delete' && !questionId) {
        return missingArgsMessage(['question_id']);
      }
      if (!action.includes('-')) {
        const data = await mainClient.getQuestion(accessToken, action);
        return formatResponse('Информация о вопросе', data);
      }
      return errorResponse('Неизвестное действие для /question.');
    }

    if (command.name === 'attempt') {
      const action = command.args[0];
      const attemptId = command.args[1];
      if (!action) {
        return missingArgsMessage(['attempt_id']);
      }
      if (action === 'create') {
        const rawPayload = joinArgs(command.args, 1);
        const payload = parseJsonPayload(rawPayload);
        if (!payload.ok) {
          const altPayload = buildAttemptPayloadFromArgs(command.args.slice(1));
          if (altPayload) {
            const missing = missingFields(altPayload, ['test_id']);
            if (missing.length > 0) {
              return missingArgsMessage(missing);
            }
            const data = await mainClient.createTestAttempt(accessToken, altPayload);
            return formatResponse('Попытка создана', data);
          }
          return jsonArgsMessage('/attempt_create <json_body>', ['json_body', 'test_id'], payload.error);
        }
        const missing = missingFields(payload.value, ['test_id']);
        if (missing.length > 0) {
          return missingArgsMessage(missing);
        }
        const data = await mainClient.createTestAttempt(accessToken, payload.value);
        return formatResponse('Попытка создана', data);
      }
      if (action === 'finish' && attemptId) {
        const data = await mainClient.finishAttempt(accessToken, attemptId);
        return formatResponse('Попытка завершена', data);
      }
      if (action === 'finish' && !attemptId) {
        return missingArgsMessage(['attempt_id']);
      }
      if (action === 'answer' && attemptId) {
        const answerOrQuestionId = command.args[2];
        const optionId = command.args[3];
        if (!answerOrQuestionId || !optionId) {
          return errorResponse('Нужны attempt_id, answer_id|question_id и option_id.');
        }
        try {
          const data = await mainClient.updateAnswer(
            accessToken,
            attemptId,
            answerOrQuestionId,
            optionId
          );
          return formatResponse('Ответ обновлён', data);
        } catch (error) {
          if (isNotFoundError(error)) {
            const created = await mainClient.createAnswer(
              accessToken,
              attemptId,
              answerOrQuestionId,
              optionId
            );
            return formatResponse('Ответ сохранён', created);
          }
          throw error;
        }
      }
      if (action === 'answer' && !attemptId) {
        return errorResponse('Нужны attempt_id, answer_id|question_id и option_id.');
      }
      if (!action.includes('-')) {
        const data = await mainClient.getAttempt(accessToken, action);
        return formatResponse('Попытка', data);
      }
      return errorResponse('Неизвестное действие для /attempt.');
    }

    if (command.name === 'notifications') {
      const sub = command.args[0];
      if (sub === 'clear') {
        await mainClient.clearNotifications(accessToken);
        return formatResponse('Уведомления очищены', { status: 'ok' });
      }
      const data = await mainClient.getNotifications(accessToken);
      return formatResponse('Уведомления', data);
    }

    return null;
  } catch (error) {
    return handleError(error);
  }
};

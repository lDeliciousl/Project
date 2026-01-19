import { BotResponse, Command } from '../domain/types';
import { MainClient } from '../integrations/mainClient';

const actionSections: string[] = [
  [
    'Пользователи:',
    '/users',
    '/user name <user_id>',
    '/user set-name <user_id> <full_name>',
    '/user courses <user_id>',
    '/user grades <user_id>',
    '/user tests <user_id>',
    '/user roles <user_id>',
    '/user set-roles <user_id> <json_roles>',
    '/user block <user_id>',
    '/user set-block <user_id> <true|false>',
    '/user add <json_body>'
  ].join('\n'),
  [
    'Дисциплины:',
    '/courses',
    '/course <course_id>',
    '/course create <json_body>',
    '/course update <course_id> <json_body>',
    '/course delete <course_id>',
    '/course students <course_id>',
    '/course tests <course_id>',
    '/course enroll <course_id> [user_id]',
    '/course unenroll <course_id> <user_id>'
  ].join('\n'),
  [
    'Тесты:',
    '/tests',
    '/test <test_id>',
    '/test create <json_body>',
    '/test activate <test_id> <true|false>',
    '/test add-question <test_id> <question_id>',
    '/test remove-question <test_id> <question_id>',
    '/attempt create <json_body>',
    '/attempt <attempt_id>',
    '/attempt finish <attempt_id>',
    '/attempt answer <attempt_id> <answer_id> <option_id>'
  ].join('\n'),
  [
    'Вопросы:',
    '/questions',
    '/question <question_id>',
    '/question create <json_body>',
    '/question update <question_id> <json_body>',
    '/question delete <question_id>'
  ].join('\n'),
  [
    'Уведомления:',
    '/notifications',
    '/notifications clear'
  ].join('\n'),
  [
    'Примеры JSON:',
    '{"name":"Math","description":"Algebra","teacher_id":"..."}',
    '{"text":"2+2?","type":"single_choice","points":1,"options":[{"text":"4","is_correct":true},{"text":"5"}]}',
    '{"test_id":"...","user_id":"...","answers":[{"question_id":"...","option_id":"..."}]}'
  ].join('\n')
];

export const actionsHelpMessage = (): BotResponse => ({
  messages: actionSections.map((text) => ({ text }))
});

const formatResponse = (title: string, payload: unknown): BotResponse => ({
  messages: [{ text: `${title}: ${JSON.stringify(payload)}` }]
});

const errorResponse = (message: string, requiresReauth = false): BotResponse => ({
  messages: [{ text: message }],
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

const handleError = (error: any): BotResponse => {
  const status = error?.response?.status;
  const detail = error?.response?.data?.error || error?.response?.data?.message || error?.message;
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
        return errorResponse('Используйте /user <action> ...');
      }
      if (action === 'name' && userId) {
        const data = await mainClient.getUserName(accessToken, userId);
        return formatResponse('ФИО пользователя', data);
      }
      if (action === 'set-name' && userId) {
        const name = joinArgs(command.args, 2);
        if (!name) {
          return errorResponse('Используйте /user set-name <user_id> <full_name>');
        }
        const data = await mainClient.setUserName(accessToken, userId, name);
        return formatResponse('ФИО обновлено', data);
      }
      if (action === 'courses' && userId) {
        const data = await mainClient.getUserCourses(accessToken, userId);
        return formatResponse('Курсы пользователя', data);
      }
      if (action === 'grades' && userId) {
        const data = await mainClient.getUserGrades(accessToken, userId);
        return formatResponse('Оценки пользователя', data);
      }
      if (action === 'tests' && userId) {
        const data = await mainClient.getUserTests(accessToken, userId);
        return formatResponse('Тесты пользователя', data);
      }
      if (action === 'roles' && userId) {
        const data = await mainClient.getUserRoles(accessToken, userId);
        return formatResponse('Роли пользователя', data);
      }
      if (action === 'set-roles' && userId) {
        const payload = parseJsonPayload(joinArgs(command.args, 2));
        if (!payload.ok) {
          return errorResponse(payload.error);
        }
        const data = await mainClient.setUserRoles(accessToken, userId, payload.value);
        return formatResponse('Роли обновлены', data);
      }
      if (action === 'block' && userId) {
        const data = await mainClient.getUserBlocked(accessToken, userId);
        return formatResponse('Статус блокировки', data);
      }
      if (action === 'set-block' && userId) {
        const flag = parseBoolean(command.args[2]);
        if (flag === null) {
          return errorResponse('Используйте /user set-block <user_id> <true|false>');
        }
        const data = await mainClient.setUserBlocked(accessToken, userId, flag);
        return formatResponse('Статус блокировки обновлён', data);
      }
      if (action === 'add') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          return errorResponse(payload.error);
        }
        const data = await mainClient.addUser(accessToken, payload.value);
        return formatResponse('Пользователь создан', data);
      }
      return errorResponse('Неизвестное действие для /user.');
    }

    if (command.name === 'courses') {
      const data = await mainClient.getCourses(accessToken);
      return formatResponse('Дисциплины', data);
    }

    if (command.name === 'course') {
      const action = command.args[0];
      const courseId = command.args[1];
      if (!action) {
        return errorResponse('Используйте /course <course_id> или /course <action> ...');
      }
      if (!courseId && action !== 'create') {
        return errorResponse('Нужен course_id.');
      }
      if (action === 'create') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          return errorResponse(payload.error);
        }
        const data = await mainClient.createCourse(accessToken, payload.value);
        return formatResponse('Дисциплина создана', data);
      }
      if (action === 'update' && courseId) {
        const payload = parseJsonPayload(joinArgs(command.args, 2));
        if (!payload.ok) {
          return errorResponse(payload.error);
        }
        const data = await mainClient.updateCourse(accessToken, courseId, payload.value);
        return formatResponse('Дисциплина обновлена', data);
      }
      if (action === 'delete' && courseId) {
        const data = await mainClient.deleteCourse(accessToken, courseId);
        return formatResponse('Дисциплина удалена', data);
      }
      if (action === 'students' && courseId) {
        const data = await mainClient.getCourseStudents(accessToken, courseId);
        return formatResponse('Студенты дисциплины', data);
      }
      if (action === 'tests' && courseId) {
        const data = await mainClient.getCourseTests(accessToken, courseId);
        return formatResponse('Тесты дисциплины', data);
      }
      if (action === 'enroll' && courseId) {
        const targetUserId = command.args[2];
        const data = await mainClient.enrollCourse(accessToken, courseId, targetUserId);
        return formatResponse('Запись на дисциплину', data);
      }
      if (action === 'unenroll' && courseId) {
        const targetUserId = command.args[2];
        if (!targetUserId) {
          return errorResponse('Используйте /course unenroll <course_id> <user_id>');
        }
        const data = await mainClient.unenrollCourse(accessToken, courseId, targetUserId);
        return formatResponse('Отчисление с дисциплины', data);
      }
      if (!action.includes('-')) {
        const data = await mainClient.getCourseInfo(accessToken, action);
        return formatResponse('Информация о дисциплине', data);
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
        return errorResponse('Используйте /test <test_id> или /test <action> ...');
      }
      if (action === 'create') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          return errorResponse(payload.error);
        }
        const data = await mainClient.createTest(accessToken, payload.value);
        return formatResponse('Тест создан', data);
      }
      if (action === 'activate' && testId) {
        const flag = parseBoolean(command.args[2]);
        if (flag === null) {
          return errorResponse('Используйте /test activate <test_id> <true|false>');
        }
        const data = await mainClient.activateTest(accessToken, testId, flag);
        return formatResponse('Статус теста обновлён', data);
      }
      if (action === 'add-question' && testId) {
        const questionId = command.args[2];
        if (!questionId) {
          return errorResponse('Используйте /test add-question <test_id> <question_id>');
        }
        const data = await mainClient.addQuestionToTest(accessToken, testId, questionId);
        return formatResponse('Вопрос добавлен в тест', data);
      }
      if (action === 'remove-question' && testId) {
        const questionId = command.args[2];
        if (!questionId) {
          return errorResponse('Используйте /test remove-question <test_id> <question_id>');
        }
        const data = await mainClient.removeQuestionFromTest(accessToken, testId, questionId);
        return formatResponse('Вопрос удалён из теста', data);
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
        return errorResponse('Используйте /question <question_id> или /question <action> ...');
      }
      if (action === 'create') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          return errorResponse(payload.error);
        }
        const data = await mainClient.createQuestion(accessToken, payload.value);
        return formatResponse('Вопрос создан', data);
      }
      if (action === 'update' && questionId) {
        const payload = parseJsonPayload(joinArgs(command.args, 2));
        if (!payload.ok) {
          return errorResponse(payload.error);
        }
        const data = await mainClient.updateQuestion(accessToken, questionId, payload.value);
        return formatResponse('Вопрос обновлён', data);
      }
      if (action === 'delete' && questionId) {
        const data = await mainClient.deleteQuestion(accessToken, questionId);
        return formatResponse('Вопрос удалён', data);
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
        return errorResponse('Используйте /attempt <attempt_id> или /attempt <action> ...');
      }
      if (action === 'create') {
        const payload = parseJsonPayload(joinArgs(command.args, 1));
        if (!payload.ok) {
          return errorResponse(payload.error);
        }
        const data = await mainClient.createTestAttempt(accessToken, payload.value);
        return formatResponse('Попытка создана', data);
      }
      if (action === 'finish' && attemptId) {
        const data = await mainClient.finishAttempt(accessToken, attemptId);
        return formatResponse('Попытка завершена', data);
      }
      if (action === 'answer' && attemptId) {
        const answerId = command.args[2];
        const optionId = command.args[3];
        if (!answerId || !optionId) {
          return errorResponse('Используйте /attempt answer <attempt_id> <answer_id> <option_id>');
        }
        const data = await mainClient.updateAnswer(accessToken, attemptId, answerId, optionId);
        return formatResponse('Ответ обновлён', data);
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

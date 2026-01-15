// API клиент для взаимодействия с main модулем (C++ сервис)

const axios = require('axios');

class MainApiClient {
  constructor() {
    // URL основного модуля из переменных окружения
    this.baseURL = process.env.MAIN_MODULE_URL || 'http://main-module:3002';
    this.timeout = parseInt(process.env.MAIN_MODULE_TIMEOUT || '5000', 10);
    
    // Создаем axios instance с базовой конфигурацией
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Обработчик ошибок
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error(`[MainApiClient] Ошибка запроса к ${error.config?.url}:`, error.message);
        if (error.response) {
          console.error(`[MainApiClient] Статус: ${error.response.status}, Данные:`, error.response.data);
        }
        return Promise.reject(error);
      }
    );

    console.log(`✅ MainApiClient инициализирован: ${this.baseURL}`);
  }

  /**
   * Выполняет запрос с автоматическим refresh токена при 401
   * По ТЗ: если main-module возвращает 401, пробуем refresh и повторяем запрос
   * @param {object} options - { endpoint, method, data, sessionToken, sessionData, sessionManager, authApiClient, res }
   * @returns {Promise<{data: any, newTokens?: {accessToken: string, refreshToken: string}}>}
   */
  async requestWithRefresh(options) {
    const { endpoint, method = 'get', data = null, sessionToken, sessionData, sessionManager, authApiClient, res } = options;
    
    let accessToken = sessionData?.accessToken;
    const refreshToken = sessionData?.refreshToken;
    
    try {
      // Первая попытка
      const result = await this.request(endpoint, method, data, accessToken);
      return { data: result };
    } catch (error) {
      // Если 401 и есть refresh token - пробуем обновить
      if (error.status === 401 && refreshToken && authApiClient && sessionManager && sessionToken) {
        console.log('[MainApiClient] Получен 401, пробуем refresh токенов...');

        // Anti-race: возможно другой запрос/инстанс уже обновил токены в Redis.
        // Перечитываем актуальную сессию и если токены уже другие — просто повторяем запрос.
        try {
          const latestSession = await sessionManager.getSession(sessionToken);
          const latestAccessToken = latestSession?.accessToken;
          const latestRefreshToken = latestSession?.refreshToken;
          const latestUpdatedAt = latestSession?.updatedAt;

          // Проверяем по timestamp и по токенам
          if (latestAccessToken && latestRefreshToken && 
              (latestRefreshToken !== refreshToken || 
               (latestUpdatedAt && latestUpdatedAt !== sessionData.updatedAt))) {
            console.log('[MainApiClient] Токены уже обновлены в Redis, повторяем запрос без refresh...');
            const retryResult = await this.request(endpoint, method, data, latestAccessToken);
            return {
              data: retryResult,
              newTokens: {
                accessToken: latestAccessToken,
                refreshToken: latestRefreshToken
              }
            };
          }
        } catch (e) {
          // игнорируем - продолжаем обычный refresh
        }
        
        let refreshResult;
        try {
          refreshResult = await authApiClient.refreshTokens(refreshToken);
        } catch (refreshError) {
          console.error('[MainApiClient] Ошибка при refresh токенов:', refreshError.message || refreshError);

          // Anti-race: если refresh упал, возможно другой запрос уже успел обновить токены.
          try {
            const latestSession = await sessionManager.getSession(sessionToken);
            const latestAccessToken = latestSession?.accessToken;
            const latestRefreshToken = latestSession?.refreshToken;
            const latestUpdatedAt = latestSession?.updatedAt;

            if (latestAccessToken && latestRefreshToken && 
                (latestRefreshToken !== refreshToken || 
                 (latestUpdatedAt && latestUpdatedAt !== sessionData.updatedAt))) {
              console.log('[MainApiClient] Refresh упал, но токены уже обновлены в Redis, повторяем запрос...');
              const retryResult = await this.request(endpoint, method, data, latestAccessToken);
              return {
                data: retryResult,
                newTokens: {
                  accessToken: latestAccessToken,
                  refreshToken: latestRefreshToken
                }
              };
            }
          } catch (e) {
            // игнорируем - считаем refresh реально провалился
          }
          
          // Refresh не удался - удаляем сессию и редиректим на главную
          if (sessionManager && sessionToken) {
            await sessionManager.deleteSession(sessionToken);
          }
          if (res) {
            res.clearCookie('session_token');
          }
          
          throw {
            status: 401,
            message: 'Session expired',
            sessionExpired: true
          };
        }

        if (refreshResult && refreshResult.access_token && refreshResult.refresh_token) {
          // Обновляем токены в Redis
          await sessionManager.updateSession(sessionToken, {
            accessToken: refreshResult.access_token,
            refreshToken: refreshResult.refresh_token,
            updatedAt: new Date().toISOString()
          });

          console.log('[MainApiClient] Токены обновлены, повторяем запрос...');

          // Повторяем запрос с новым access token
          const retryResult = await this.request(endpoint, method, data, refreshResult.access_token);
          return {
            data: retryResult,
            newTokens: {
              accessToken: refreshResult.access_token,
              refreshToken: refreshResult.refresh_token
            }
          };
        }
      }
      
      // Не 401 или нет refresh token - пробрасываем ошибку
      throw error;
    }
  }

  /**
   * Формирует заголовок авторизации
   * @param {string} accessToken - JWT access token
   * @returns {object} Заголовки с Authorization
   */
  getAuthHeaders(accessToken) {
    if (!accessToken) return {};
    return { 'Authorization': `Bearer ${accessToken}` };
  }

  /**
   * Выполняет запрос к main модулю
   * @param {string} endpoint - Путь к endpoint (например, '/api/tests')
   * @param {string} method - HTTP метод (get, post, put, delete)
   * @param {object} data - Тело запроса (для POST/PUT)
   * @param {string} accessToken - JWT access token для авторизации
   * @returns {Promise} Ответ от сервера
   */
  async request(endpoint, method = 'get', data = null, accessToken = null) {
    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          ...this.client.defaults.headers,
          ...this.getAuthHeaders(accessToken)
        }
      };

      if (data && (method === 'post' || method === 'put' || method === 'patch' || method === 'delete')) {
        config.data = data;
      }

      const response = await this.client.request(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        // Сервер вернул ошибку
        throw {
          status: error.response.status,
          message: error.response.data?.error || error.response.data?.message || error.message,
          data: error.response.data
        };
      } else if (error.request) {
        // Запрос был отправлен, но ответа не получено
        throw {
          status: 503,
          message: 'Main модуль недоступен',
          error: 'Service unavailable'
        };
      } else {
        // Ошибка при настройке запроса
        throw {
          status: 500,
          message: error.message,
          error: 'Request setup error'
        };
      }
    }
  }

  // ========== Методы для работы с тестами ==========

  /**
   * Получить список всех тестов
   */
  async getTests(accessToken) {
    return this.request('/api/tests', 'get', null, accessToken);
  }

  /**
   * Получить детали конкретного теста
   */
  async getTestDetails(testId, accessToken) {
    return this.request(`/api/tests/${testId}`, 'get', null, accessToken);
  }

  /**
   * Создать новый тест
   */
  async createTest(testData, accessToken) {
    return this.request('/api/tests', 'post', testData, accessToken);
  }

  /**
   * Активировать/деактивировать тест
   */
  async activateTest(testId, isActive, accessToken) {
    return this.request(`/api/tests/${testId}/activate`, 'put', { is_active: isActive }, accessToken);
  }

  /**
   * Добавить вопрос к тесту (создать новый вопрос в тесте)
   */
  async addQuestionToTest(testId, questionData, accessToken) {
    return this.request(`/api/tests/${testId}/questions`, 'post', questionData, accessToken);
  }

  /**
   * Удалить вопрос из теста
   */
  async removeQuestionFromTest(testId, questionId, accessToken) {
    return this.request(`/api/tests/${testId}/questions/${questionId}`, 'delete', null, accessToken);
  }

  /**
   * Обновить порядок вопросов в тесте
   */
  async updateQuestionsOrder(testId, questionIds, accessToken) {
    return this.request(`/api/tests/${testId}/questions/order`, 'put', { question_ids: questionIds }, accessToken);
  }

  /**
   * Обновить тест
   */
  async updateTest(testId, testData, accessToken) {
    return this.request(`/api/tests/${testId}`, 'put', testData, accessToken);
  }

  /**
   * Удалить тест
   */
  async deleteTest(testId, accessToken) {
    return this.request(`/api/tests/${testId}`, 'delete', null, accessToken);
  }

  /**
   * Создать попытку прохождения теста
   */
  async createTestAttempt(attemptData, accessToken) {
    return this.request('/api/tests/attempts', 'post', attemptData, accessToken);
  }

  // ========== Методы для работы с попытками (Attempts) ==========

  /**
   * Получить информацию о попытке
   */
  async getAttempt(attemptId, accessToken) {
    return this.request(`/api/attempts/${attemptId}`, 'get', null, accessToken);
  }

  /**
   * Завершить попытку
   */
  async finishAttempt(attemptId, accessToken) {
    return this.request(`/api/attempts/${attemptId}/finish`, 'post', null, accessToken);
  }

  /**
   * Обновить ответ в попытке
   */
  async updateAnswer(attemptId, answerId, optionId, accessToken) {
    return this.request(`/api/attempts/${attemptId}/answers/${answerId}`, 'put', { option_id: optionId }, accessToken);
  }

  /**
   * Получить ответы попытки
   */
  async getAttemptAnswers(attemptId, accessToken) {
    return this.request(`/api/attempts/${attemptId}/answers`, 'get', null, accessToken);
  }

  /**
   * Удалить ответ в попытке
   */
  async deleteAnswer(attemptId, answerId, accessToken) {
    return this.request(`/api/attempts/${attemptId}/answers/${answerId}`, 'delete', null, accessToken);
  }

  // ========== Методы для работы с вопросами (Questions) ==========

  /**
   * Получить список вопросов
   */
  async getQuestions(accessToken) {
    return this.request('/api/questions', 'get', null, accessToken);
  }

  /**
   * Получить вопрос по ID
   */
  async getQuestion(questionId, accessToken) {
    return this.request(`/api/questions/${questionId}`, 'get', null, accessToken);
  }

  /**
   * Создать вопрос
   */
  async createQuestion(questionData, accessToken) {
    return this.request('/api/questions', 'post', questionData, accessToken);
  }

  /**
   * Обновить вопрос
   */
  async updateQuestion(questionId, questionData, accessToken) {
    return this.request(`/api/questions/${questionId}`, 'put', questionData, accessToken);
  }

  /**
   * Удалить вопрос
   */
  async deleteQuestion(questionId, accessToken) {
    return this.request(`/api/questions/${questionId}`, 'delete', null, accessToken);
  }

  // ========== Методы для работы с курсами (Courses) ==========

  /**
   * Получить список всех курсов
   */
  async getCourses(accessToken) {
    return this.request('/api/courses', 'get', null, accessToken);
  }

  /**
   * Получить информацию о курсе
   */
  async getCourse(courseId, accessToken) {
    return this.request(`/api/courses/${courseId}`, 'get', null, accessToken);
  }

  /**
   * Создать курс
   */
  async createCourse(courseData, accessToken) {
    return this.request('/api/courses', 'post', courseData, accessToken);
  }

  /**
   * Обновить курс
   */
  async updateCourse(courseId, courseData, accessToken) {
    return this.request(`/api/courses/${courseId}`, 'put', courseData, accessToken);
  }

  /**
   * Удалить курс
   */
  async deleteCourse(courseId, accessToken) {
    return this.request(`/api/courses/${courseId}`, 'delete', null, accessToken);
  }

  /**
   * Получить студентов курса
   */
  async getCourseStudents(courseId, accessToken) {
    return this.request(`/api/courses/${courseId}/students`, 'get', null, accessToken);
  }

  /**
   * Получить тесты курса
   */
  async getCourseTests(courseId, accessToken) {
    return this.request(`/api/courses/${courseId}/tests`, 'get', null, accessToken);
  }

  /**
   * Записаться на курс
   */
  async enrollToCourse(courseId, userId, accessToken) {
    return this.request(`/api/courses/${courseId}/enroll`, 'post', userId ? { user_id: userId } : {}, accessToken);
  }

  /**
   * Отписаться от курса
   */
  async unenrollFromCourse(courseId, userId, accessToken) {
    return this.request(`/api/courses/${courseId}/enroll/${userId}`, 'delete', null, accessToken);
  }

  // ========== Методы для работы с пользователями ==========

  /**
   * Получить список всех пользователей
   */
  async getUsers(accessToken) {
    return this.request('/api/db/users', 'get', null, accessToken);
  }

  /**
   * Добавить нового пользователя
   */
  async addUser(userData, accessToken) {
    return this.request('/api/db/addUser', 'post', userData, accessToken);
  }

  /**
   * Получить имя пользователя
   */
  async getUserName(userId, accessToken) {
    return this.request(`/api/db/users/${userId}/name`, 'get', null, accessToken);
  }

  /**
   * Установить имя пользователя
   */
  async setUserName(userId, name, accessToken) {
    return this.request(`/api/db/users/${userId}/name`, 'put', { name }, accessToken);
  }

  /**
   * Получить курсы пользователя
   */
  async getUserCourses(userId, accessToken) {
    return this.request(`/api/db/users/${userId}/courses`, 'get', null, accessToken);
  }

  /**
   * Получить оценки пользователя
   */
  async getUserGrades(userId, accessToken) {
    return this.request(`/api/db/users/${userId}/grades`, 'get', null, accessToken);
  }

  /**
   * Получить тесты пользователя
   */
  async getUserTests(userId, accessToken) {
    return this.request(`/api/db/users/${userId}/tests`, 'get', null, accessToken);
  }

  /**
   * Получить роли пользователя
   */
  async getUserRoles(userId, accessToken) {
    return this.request(`/api/db/users/${userId}/roles`, 'get', null, accessToken);
  }

  /**
   * Установить роли пользователя
   */
  async setUserRoles(userId, roles, accessToken) {
    return this.request(`/api/db/users/${userId}/roles`, 'put', { roles }, accessToken);
  }

  /**
   * Проверить, заблокирован ли пользователь
   */
  async getUserBlocked(userId, accessToken) {
    return this.request(`/api/db/users/${userId}/block`, 'get', null, accessToken);
  }

  /**
   * Заблокировать/разблокировать пользователя
   */
  async setUserBlocked(userId, isBlocked, accessToken) {
    return this.request(`/api/db/users/${userId}/block`, 'put', { is_blocked: isBlocked }, accessToken);
  }

  // ========== Методы для работы с уведомлениями ==========

  /**
   * Получить уведомления текущего пользователя
   */
  async getNotifications(accessToken) {
    return this.request('/notification', 'get', null, accessToken);
  }

  /**
   * Очистить уведомления текущего пользователя
   */
  async clearNotifications(accessToken) {
    return this.request('/notification', 'delete', null, accessToken);
  }

  /**
   * Получить статус блокировки пользователя
   */
  async getUserBlockStatus(userId, accessToken) {
    return this.request(`/users/${userId}/block`, 'get', null, accessToken);
  }

  /**
   * Установить статус блокировки пользователя
   */
  async setUserBlockStatus(userId, isBlocked, accessToken) {
    return this.request(`/users/${userId}/block`, 'put', { is_blocked: isBlocked }, accessToken);
  }

  // ========== Служебные методы ==========

  /**
   * Проверка здоровья сервиса
   */
  async healthCheck() {
    try {
      return await this.request('/health', 'get');
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Тестовый запрос
   */
  async test(accessToken) {
    return this.request('/api/test', 'get', null, accessToken);
  }
}

// Экспортируем singleton
module.exports = new MainApiClient();

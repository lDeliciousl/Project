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
   * Выполняет запрос к main модулю
   * @param {string} endpoint - Путь к endpoint (например, '/api/tests')
   * @param {string} method - HTTP метод (get, post, put, delete)
   * @param {object} data - Тело запроса (для POST/PUT)
   * @param {object} headers - Дополнительные заголовки
   * @returns {Promise} Ответ от сервера
   */
  async request(endpoint, method = 'get', data = null, headers = {}) {
    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          ...this.client.defaults.headers,
          ...headers
        }
      };

      if (data && (method === 'post' || method === 'put' || method === 'patch')) {
        config.data = data;
      }

      const response = await this.client.request(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        // Сервер вернул ошибку
        throw {
          status: error.response.status,
          message: error.response.data?.message || error.message,
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
  async getTests() {
    return this.request('/api/tests', 'get');
  }

  /**
   * Получить детали конкретного теста
   */
  async getTestDetails(testId) {
    return this.request(`/api/tests/${testId}`, 'get');
  }

  /**
   * Создать новый тест
   */
  async createTest(testData) {
    return this.request('/api/tests', 'post', testData);
  }

  /**
   * Добавить вопрос к тесту
   */
  async addQuestion(testId, questionData) {
    return this.request(`/api/tests/${testId}/questions`, 'post', questionData);
  }

  /**
   * Создать попытку прохождения теста
   */
  async createTestAttempt(attemptData) {
    return this.request('/api/tests/attempts', 'post', attemptData);
  }

  // ========== Методы для работы с пользователями ==========

  /**
   * Получить список всех пользователей
   */
  async getUsers() {
    return this.request('/api/db/users', 'get');
  }

  /**
   * Добавить нового пользователя
   */
  async addUser(userData) {
    return this.request('/api/db/addUser', 'post', userData);
  }

  /**
   * Получить имя пользователя
   */
  async getUserName(userId) {
    return this.request(`/api/db/users/${userId}/name`, 'get');
  }

  /**
   * Установить имя пользователя
   */
  async setUserName(userId, name) {
    return this.request(`/api/db/users/${userId}/name`, 'put', { name });
  }

  /**
   * Получить курсы пользователя
   */
  async getUserCourses(userId) {
    return this.request(`/api/db/users/${userId}/courses`, 'get');
  }

  /**
   * Получить оценки пользователя
   */
  async getUserGrades(userId) {
    return this.request(`/api/db/users/${userId}/grades`, 'get');
  }

  /**
   * Получить тесты пользователя
   */
  async getUserTests(userId) {
    return this.request(`/api/db/users/${userId}/tests`, 'get');
  }

  /**
   * Получить роли пользователя
   */
  async getUserRoles(userId) {
    return this.request(`/api/db/users/${userId}/roles`, 'get');
  }

  /**
   * Установить роли пользователя
   */
  async setUserRoles(userId, roles) {
    return this.request(`/api/db/users/${userId}/roles`, 'put', { roles });
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
  async test() {
    return this.request('/api/test', 'get');
  }
}

// Экспортируем singleton
module.exports = new MainApiClient();

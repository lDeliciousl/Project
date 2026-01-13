// API клиент для взаимодействия с auth модулем (Go сервис)

const axios = require('axios');

class AuthApiClient {
  constructor() {
    // URL auth модуля из переменных окружения
    this.baseURL = process.env.AUTH_MODULE_URL || 'http://auth-module:8001';
    this.timeout = parseInt(process.env.AUTH_MODULE_TIMEOUT || '10000', 10);
    
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
        console.error(`[AuthApiClient] Ошибка запроса к ${error.config?.url}:`, error.message);
        if (error.response) {
          console.error(`[AuthApiClient] Статус: ${error.response.status}, Данные:`, error.response.data);
        }
        return Promise.reject(error);
      }
    );

    console.log(`✅ AuthApiClient инициализирован: ${this.baseURL}`);
  }

  /**
   * Выполняет запрос к auth модулю
   * @param {string} endpoint - Путь к endpoint (например, '/api/auth/init')
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
          message: error.response.data?.error || error.response.data?.message || error.message,
          data: error.response.data
        };
      } else if (error.request) {
        // Запрос был отправлен, но ответа не получено
        throw {
          status: 503,
          message: 'Auth модуль недоступен',
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

  // ========== Методы для работы с авторизацией ==========

  /**
   * Инициализирует OAuth авторизацию
   * @param {string} type - Тип авторизации (github, yandex, code)
   * @param {string} loginToken - Токен входа
   * @returns {Promise<{auth_url: string}>} URL для редиректа на OAuth провайдера
   */
  async initOAuth(type, loginToken) {
    return this.request('/api/auth/init', 'post', {
      type: type,
      login_token: loginToken
    });
  }

  /**
   * Проверяет статус авторизации по login_token
   * @param {string} loginToken - Токен входа
   * @returns {Promise<{status: string, access_token?: string, refresh_token?: string, user?: object}>}
   */
  async verifyLoginToken(loginToken) {
    return this.request(`/api/auth/verify/${loginToken}`, 'get');
  }

  /**
   * Обновляет токены
   * @param {string} refreshToken - Refresh токен
   * @returns {Promise<{access_token: string, refresh_token: string}>}
   */
  async refreshTokens(refreshToken) {
    return this.request('/api/auth/refresh', 'post', {
      refresh_token: refreshToken
    });
  }

  /**
   * Выход из системы
   * @param {string} refreshToken - Refresh токен для инвалидации
   * @returns {Promise<void>}
   */
  async logout(refreshToken) {
    return this.request('/api/auth/logout', 'post', {
      refresh_token: refreshToken
    });
  }

  /**
   * Генерирует код для авторизации по email
   * @param {string} loginToken - Токен входа
   * @param {string} email - Email пользователя
   * @returns {Promise<{code: string}>}
   */
  async generateAuthCode(loginToken, email) {
    return this.request('/api/auth/code/generate', 'post', {
      login_token: loginToken,
      email: email
    });
  }

  /**
   * Проверяет код авторизации
   * @param {string} loginToken - Токен входа
   * @param {string} code - Код авторизации
   * @param {string} refreshToken - Refresh токен (для получения email)
   * @returns {Promise<{status: string}>}
   */
  async verifyAuthCode(loginToken, code, refreshToken) {
    return this.request('/api/auth/code/verify', 'post', {
      login_token: loginToken,
      code: code,
      refresh_token: refreshToken
    });
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
}

// Экспортируем singleton
module.exports = new AuthApiClient();

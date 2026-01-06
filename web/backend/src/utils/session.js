const crypto = require('crypto');
const redisClient = require('./redisClient');

class SessionManager {
  constructor() {
    this.client = redisClient.getClient();
  }

  // Генерация токена сессии
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Генерация токена входа
  generateLoginToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Сохранение сессии в Redis
  async saveSession(sessionToken, data) {
    try {
      // Сессия хранится 7 дней
      await this.client.set(`session:${sessionToken}`, JSON.stringify(data), {
        EX: 60 * 60 * 24 * 7 // 7 дней в секундах
      });
      return true;
    } catch (error) {
      console.error('Error saving session:', error);
      return false;
    }
  }

  // Получение сессии из Redis
  async getSession(sessionToken) {
    try {
      const data = await this.client.get(`session:${sessionToken}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  // Обновление сессии
  async updateSession(sessionToken, updates) {
    try {
      const current = await this.getSession(sessionToken);
      if (!current) return false;
      
      const updated = { ...current, ...updates };
      await this.saveSession(sessionToken, updated);
      return true;
    } catch (error) {
      console.error('Error updating session:', error);
      return false;
    }
  }

  // Удаление сессии
  async deleteSession(sessionToken) {
    try {
      await this.client.del(`session:${sessionToken}`);
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  }

  // Создание новой сессии для анонимного пользователя
  async createAnonymousSession(loginToken) {
    const sessionToken = this.generateSessionToken();
    const sessionData = {
      status: 'anonymous',
      loginToken: loginToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = await this.saveSession(sessionToken, sessionData);
    return saved ? sessionToken : null;
  }

  // Обновление сессии после успешной авторизации
  async updateToAuthenticated(sessionToken, accessToken, refreshToken, userData) {
    return await this.updateSession(sessionToken, {
      status: 'authenticated',
      accessToken: accessToken,
      refreshToken: refreshToken,
      userData: userData,
      loginToken: null, // Токен входа больше не нужен
      authenticatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

module.exports = new SessionManager();
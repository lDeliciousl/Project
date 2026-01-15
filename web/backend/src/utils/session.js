const crypto = require('crypto');
const redisClient = require('./redisClient');

class SessionManager {
  constructor() {
    this.client = redisClient.getClient();
    this.memoryStorage = new Map(); // Fallback storage
    this.redisAvailable = true;
  }

  // Генерация токена сессии
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Генерация токена входа
  generateLoginToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Сохранение сессии в Redis с fallback на memory
  async saveSession(sessionToken, data) {
    try {
      if (this.redisAvailable) {
        // Убеждаемся, что клиент подключен
        if (!this.client.isOpen) {
          await this.client.connect();
        }
        // Сессия хранится 7 дней
        await this.client.set(`session:${sessionToken}`, JSON.stringify(data), {
          EX: 60 * 60 * 24 * 7 // 7 дней в секундах
        });
      } else {
        // Fallback на memory storage
        this.memoryStorage.set(sessionToken, {
          data,
          expires: Date.now() + (60 * 60 * 24 * 7 * 1000) // 7 дней
        });
      }
      return true;
    } catch (error) {
      console.error('Error saving session to Redis, using memory fallback:', error);
      this.redisAvailable = false;
      // Fallback на memory storage
      try {
        this.memoryStorage.set(sessionToken, {
          data,
          expires: Date.now() + (60 * 60 * 24 * 7 * 1000) // 7 дней
        });
        return true;
      } catch (memoryError) {
        console.error('Error saving session to memory:', memoryError);
        return false;
      }
    }
  }

  // Получение сессии из Redis с fallback на memory
  async getSession(sessionToken) {
    try {
      if (this.redisAvailable) {
        // Убеждаемся, что клиент подключен
        if (!this.client.isOpen) {
          await this.client.connect();
        }
        const data = await this.client.get(`session:${sessionToken}`);
        if (data) return JSON.parse(data);
      }

      // Fallback на memory storage
      const memoryData = this.memoryStorage.get(sessionToken);
      if (memoryData && memoryData.expires > Date.now()) {
        return memoryData.data;
      }
      return null;
    } catch (error) {
      console.error('Error getting session from Redis, trying memory fallback:', error);
      this.redisAvailable = false;
      
      // Fallback на memory storage
      try {
        if (!this.client.isOpen) {
          await this.client.connect();
        }
        const memoryData = this.memoryStorage.get(sessionToken);
        if (memoryData && memoryData.expires > Date.now()) {
          return memoryData.data;
        }
      } catch (memoryError) {
        console.error('Error getting session from memory:', memoryError);
      }
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

  // Удаление сессии с fallback на memory
  async deleteSession(sessionToken) {
    try {
      if (this.redisAvailable) {
        await this.client.del(`session:${sessionToken}`);
      }
      // Всегда удаляем из memory storage
      this.memoryStorage.delete(sessionToken);
      return true;
    } catch (error) {
      console.error('Error deleting session from Redis, using memory fallback:', error);
      this.redisAvailable = false;
      try {
        // Fallback - удаляем только из memory
        this.memoryStorage.delete(sessionToken);
        return true;
      } catch (memoryError) {
        console.error('Error deleting session from memory:', memoryError);
        return false;
      }
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
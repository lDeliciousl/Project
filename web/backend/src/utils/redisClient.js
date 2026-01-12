const redis = require('redis');

class RedisClient {
  constructor() {
    // Конфигурация подключения к Redis
    // В Docker Compose сервис будет доступен по имени 'web-redis'
    this.client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      }
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    return this.client;
  }

  getClient() {
    return this.client;
  }
}

// Экспортируем singleton экземпляр
module.exports = new RedisClient();
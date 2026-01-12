// Заглушка вместо реального модуля авторизации

class MockApiClient {
  constructor() {
    console.log('⚠️  Используется MOCK API Client - реальные сервисы не доступны');
  }

  // Имитация OAuth авторизации
  async initOAuth(type, loginToken) {
    console.log(`[MOCK] Запрос OAuth: ${type}, токен: ${loginToken}`);
    
    // Для тестирования возвращаем фиктивный URL
    return {
      auth_url: `/mock/auth?type=${type}&token=${loginToken}&status=success`
    };
  }

  // Имитация проверки токена входа
  async verifyLoginToken(loginToken) {
    console.log(`[MOCK] Проверка токена: ${loginToken}`);
    
    // Имитируем задержку
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // В 80% случаев успех, в 20% - отказ
    const isSuccess = Math.random() > 0.2;
    
    if (isSuccess) {
      return {
        status: 'authenticated',
        access_token: `mock_access_${Date.now()}`,
        refresh_token: `mock_refresh_${Date.now()}`,
        user: {
          id: `user_${Date.now()}`,
          email: 'student@example.com',
          name: 'Тестовый Студент',
          roles: ['student'],
          permissions: ['course:read', 'test:take']
        }
      };
    } else {
      return {
        status: 'denied',
        message: 'Пользователь отказался от авторизации'
      };
    }
  }

  // Имитация запросов к главному модулю
  async callMainService(endpoint, accessToken, data = {}, method = 'get') {
    console.log(`[MOCK] Запрос к главному модулю: ${endpoint}`);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Возвращаем фиктивные данные
    if (endpoint === '/courses') {
      return {
        courses: [
          {
            id: 'course_1',
            name: 'Основы программирования',
            description: 'Введение в Python',
            instructor: 'Иванов И.И.',
            enrolled: true,
            progress: 75
          },
          {
            id: 'course_2', 
            name: 'Базы данных',
            description: 'SQL и проектирование БД',
            instructor: 'Петров П.П.',
            enrolled: true,
            progress: 30
          }
        ]
      };
    }
    
    // По умолчанию
    return {
      endpoint: endpoint,
      timestamp: new Date().toISOString(),
      data: data
    };
  }
}

// Экспортируем singleton
module.exports = new MockApiClient();
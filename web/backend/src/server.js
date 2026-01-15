const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const redisClient = require('./utils/redisClient');
const sessionMiddleware = require('./middleware/session');

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const mainRoutes = require('./routes/main');
const apiRoutes = require('./routes/api');
const mockRoutes = require('./routes/mock'); // Добавляем маршруты заглушек
const teacherRoutes = require('./routes/teacher'); // Маршруты редактора курсов
const testDisciplinesRoutes = require('./routes/test-disciplines'); // Тестовые дисциплины

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка шаблонизатора EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Простой тестовый маршрут без middleware
app.get('/test-disciplines', async (req, res) => {
  try {
    const mainApiClient = require('./utils/mainApiClient');
    
    // Получаем курсы напрямую
    const coursesResp = await mainApiClient.getCourses(null);
    const courses = coursesResp?.courses || [];
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Тестовые дисциплины</title>
          <style>
              body { font-family: Arial, sans-serif; padding: 40px; background: #f5f7fa; }
              .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
              .course { margin: 20px 0; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; }
              h1 { color: #333; margin-bottom: 20px; }
              h3 { color: #667eea; margin-bottom: 10px; }
              p { color: #666; line-height: 1.6; }
              .btn { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>📖 Тестовые дисциплины</h1>
              <p>Найдено ${courses.length} курсов в базе данных:</p>
              
              ${courses.map(course => `
                  <div class="course">
                      <h3>${course.name}</h3>
                      <p>${course.description}</p>
                      <p><strong>ID:</strong> ${course.id}</p>
                      <p><strong>Тестов:</strong> ${course.tests_count || 0}</p>
                      <p><strong>Студентов:</strong> ${course.students_count || 0}</p>
                  </div>
              `).join('')}
              
              <a href="/" class="btn">🏠 На главную</a>
          </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Ошибка</title>
          <style>
              body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
              .error { color: #ef4444; }
          </style>
      </head>
      <body>
          <h1 class="error">❌ Ошибка</h1>
          <p>${error.message}</p>
          <a href="/">Вернуться на главную</a>
      </body>
      </html>
    `);
  }
});

// Middleware для проверки сессии
app.use(sessionMiddleware);

// Подключаем маршруты
app.use('/', mainRoutes);
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/mock', mockRoutes); // Подключаем маршруты заглушек
app.use('/teacher', teacherRoutes); // Панель преподавателя и редактор курсов

// Обработка 404
app.use((req, res) => {
  res.status(404).render('404', { 
    title: 'Страница не найдена',
    userStatus: req.userStatus || 'unknown'
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('❌ Ошибка сервера:', err);
  res.status(500).render('error', {
    title: 'Ошибка сервера',
    message: err.message
  });
});

// Запуск сервера
app.listen(PORT, () => {
  // Проверка подключения к main модулю
  const mainApiClient = require('./utils/mainApiClient');
  mainApiClient.healthCheck().then(health => {
    console.log('='.repeat(60));
    console.log('🌐 ВЕБ-МОДУЛЬ СИСТЕМЫ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    console.log(`✅ Сервер запущен на порту: ${PORT}`);
    console.log(`📡 Внутри Docker: http://web-backend:${PORT}`);
    console.log(`🔗 Через Nginx: http://localhost:8000`);
    console.log('='.repeat(60));
    console.log('\n🔌 Подключение к Main модулю:');
    if (health.status === 'ok') {
      console.log('  ✅ Main модуль доступен');
    } else {
      console.log('  ⚠️  Main модуль недоступен:', health.message || 'Неизвестная ошибка');
    }
    console.log('='.repeat(60));
    console.log('\n🔗 Доступные маршруты:');
    console.log('  • http://localhost:8000/ - Главная страница');
    console.log('  • http://localhost:8000/api/health - Проверка здоровья API');
    console.log('  • http://localhost:8000/api/main-health - Проверка подключения к Main модулю');
    console.log('  • http://localhost:8000/mock/quick-login - Быстрый вход (тест)');
    console.log('  • http://localhost:8000/mock/session-info - Информация о сессии');
    console.log('  • http://localhost:8000/api/test-redis - Тест Redis');
    console.log('='.repeat(60));
  }).catch(err => {
    console.log('='.repeat(60));
    console.log('🌐 ВЕБ-МОДУЛЬ СИСТЕМЫ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    console.log(`✅ Сервер запущен на порту: ${PORT}`);
    console.log(`📡 Внутри Docker: http://web-backend:${PORT}`);
    console.log(`🔗 Через Nginx: http://localhost:8000`);
    console.log('='.repeat(60));
    console.log('\n🔌 Подключение к Main модулю:');
    console.log('  ❌ Main модуль недоступен:', err.message);
    console.log('  ⚠️  Некоторые функции могут быть недоступны');
    console.log('='.repeat(60));
    console.log('\n🔗 Доступные маршруты:');
    console.log('  • http://localhost:8000/ - Главная страница');
    console.log('  • http://localhost:8000/api/health - Проверка здоровья API');
    console.log('  • http://localhost:8000/api/main-health - Проверка подключения к Main модулю');
    console.log('  • http://localhost:8000/mock/quick-login - Быстрый вход (тест)');
    console.log('  • http://localhost:8000/mock/session-info - Информация о сессии');
    console.log('  • http://localhost:8000/api/test-redis - Тест Redis');
    console.log('='.repeat(60));
  });
});
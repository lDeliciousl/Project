const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const redisClient = require('./utils/redisClient');
const sessionMiddleware = require('./middleware/session');

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const mainRoutes = require('./routes/main');
const apiRoutes = require('./routes/api');
const teacherRoutes = require('./routes/teacher'); // Маршруты редактора курсов
const adminRoutes = require('./routes/admin'); // Административные маршруты

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка шаблонизатора EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Middleware для проверки сессии
app.use(sessionMiddleware);

// Подключаем маршруты
app.use('/', mainRoutes);
app.use('/auth', authRoutes);
app.use('/teacher', teacherRoutes); // Панель преподавателя и редактор курсов
app.use('/admin', adminRoutes); // Административные маршруты
app.use('/api', apiRoutes); // API routes moved after session middleware

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
            console.log('  • http://localhost:8000/api/test-redis - Тест Redis');
    console.log('='.repeat(60));
  });
});
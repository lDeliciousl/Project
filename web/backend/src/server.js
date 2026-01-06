// server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const redisClient = require('./utils/redisClient');
const sessionMiddleware = require('./middleware/session');
const authRoutes = require('./routes/auth');
const mainRoutes = require('./routes/main');
const apiRoutes = require('./routes/api');

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

// Подключение к Redis при старте сервера
redisClient.connect().then(() => {
  console.log('✅ Server connected to Redis');
}).catch(err => {
  console.error('❌ Failed to connect to Redis:', err);
});

// Middleware для проверки сессии
app.use(sessionMiddleware);

// Подключаем маршруты
app.use('/', mainRoutes);
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Обработка 404
app.use((req, res) => {
  res.status(404).render('404', { 
    title: 'Страница не найдена',
    userStatus: req.userStatus || 'anonymous'
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).render('error', {
    title: 'Ошибка сервера',
    message: err.message
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🌐 ВЕБ-МОДУЛЬ СИСТЕМЫ ТЕСТИРОВАНИЯ');
  console.log('='.repeat(60));
  console.log(`✅ Backend сервер запущен на порту: ${PORT}`);
  console.log(`📡 Внутри Docker: http://web-backend:${PORT}`);
  console.log(`🔗 Через Nginx: http://localhost:8080`);
  console.log('='.repeat(60));
});
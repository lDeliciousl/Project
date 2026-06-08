const express = require('express');
const router = express.Router();

// Главная страница
router.get('/', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  console.log(`[MAIN] Статус пользователя: ${userStatus}`);
  
  // Фиктивные курсы для демонстрации
  const mockCourses = [
    {
      id: 'course_1',
      name: 'Основы программирования',
      description: 'Введение в программирование на Python',
      instructor: 'Иванов И.И.',
      enrolled: true,
      active: true,
      progress: 75,
      tests: [
        { id: 'test_1', name: 'Тест 1: Основы Python', completed: true, score: 85, date: '2024-01-15' },
        { id: 'test_2', name: 'Тест 2: Функции', completed: true, score: 92, date: '2024-01-22' },
        { id: 'test_3', name: 'Тест 3: ООП', completed: false, score: null }
      ],
      materials: [
        { name: 'Лекция 1: Введение', type: 'PDF' },
        { name: 'Лекция 2: Синтаксис', type: 'Видео' }
      ]
    },
    {
      id: 'course_2',
      name: 'Базы данных',
      description: 'SQL и проектирование баз данных',
      instructor: 'Петров П.П.',
      enrolled: true,
      active: true,
      progress: 30,
      tests: [
        { id: 'test_4', name: 'Тест 1: Основы SQL', completed: true, score: 78, date: '2024-01-10' },
        { id: 'test_5', name: 'Тест 2: JOIN операции', completed: false, score: null }
      ],
      materials: [
        { name: 'Лекция 1: Введение в БД', type: 'PDF' }
      ]
    },
    {
      id: 'course_3',
      name: 'Веб-разработка',
      description: 'HTML, CSS, JavaScript и фреймворки',
      instructor: 'Сидоров С.С.',
      enrolled: false,
      active: true,
      progress: 0
    }
  ];
  
  switch (userStatus) {
    case 'unknown':
      // Показываем страницу авторизации
      res.render('login', {
        title: 'Авторизация',
        authMethods: [
          { type: 'github', name: 'GitHub', icon: 'github' },
          { type: 'yandex', name: 'Яндекс ID', icon: 'yandex' },
          { type: 'code', name: 'Код авторизации', icon: 'key' }
        ]
      });
      break;
      
    case 'anonymous':
      // Показываем страницу ожидания авторизации
      res.render('waiting', {
        title: 'Ожидание авторизации',
        loginToken: sessionData?.loginToken || 'NO_TOKEN',
        authMethods: [
          { type: 'github', name: 'GitHub' },
          { type: 'yandex', name: 'Яндекс ID' },
          { type: 'code', name: 'Код' }
        ]
      });
      break;
      
    case 'authenticated':
      // Показываем личный кабинет с фиктивными данными
      res.render('dashboard', {
        title: 'Личный кабинет',
        user: sessionData?.userData || { 
          name: 'Пользователь', 
          email: 'unknown@example.com',
          roles: ['student']
        },
        courses: mockCourses.filter(c => c.enrolled)
      });
      break;
      
    default:
      res.redirect('/');
  }
});

// Страница входа (без параметров)
router.get('/login', (req, res) => {
  res.redirect('/');
});

// Выход из системы
router.get('/logout', async (req, res) => {
  const { sessionToken } = req;
  
  if (sessionToken) {
    const sessionManager = require('../utils/session');
    await sessionManager.deleteSession(sessionToken);
  }
  
  res.clearCookie('session_token');
  res.redirect('/');
});

// Демо-страница курса
router.get('/course/:id', async (req, res) => {
  const { userStatus, sessionData } = req;
  
  if (userStatus !== 'authenticated') {
    return res.redirect('/');
  }
  
  // Фиктивные данные курса
  const mockCourses = {
    'course_1': {
      id: 'course_1',
      name: 'Основы программирования',
      description: 'Введение в программирование на Python. Изучите базовые концепции, синтаксис и основные структуры данных.',
      instructor: 'Иванов Иван Иванович',
      enrolled: true,
      progress: 75,
      tests: [
        { id: 'test_1', name: 'Тест 1: Основы Python', completed: true, score: 85, date: '2024-01-15' },
        { id: 'test_2', name: 'Тест 2: Функции и модули', completed: true, score: 92, date: '2024-01-22' },
        { id: 'test_3', name: 'Тест 3: Объектно-ориентированное программирование', completed: false, score: null }
      ],
      materials: [
        { name: 'Лекция 1: Введение в Python', type: 'PDF' },
        { name: 'Лекция 2: Синтаксис и типы данных', type: 'Видео' },
        { name: 'Лекция 3: Управляющие конструкции', type: 'PDF' },
        { name: 'Практическая работа 1', type: 'Задание' }
      ]
    },
    'course_2': {
      id: 'course_2',
      name: 'Базы данных',
      description: 'Изучение SQL, проектирование баз данных, нормализация и оптимизация запросов.',
      instructor: 'Петров Петр Петрович',
      enrolled: true,
      progress: 30,
      tests: [
        { id: 'test_4', name: 'Тест 1: Основы SQL', completed: true, score: 78, date: '2024-01-10' },
        { id: 'test_5', name: 'Тест 2: JOIN операции и агрегация', completed: false, score: null },
        { id: 'test_6', name: 'Тест 3: Нормализация БД', completed: false, score: null }
      ],
      materials: [
        { name: 'Лекция 1: Введение в базы данных', type: 'PDF' },
        { name: 'Лекция 2: Основы SQL', type: 'Видео' }
      ]
    }
  };
  
  const courseId = req.params.id;
  const course = mockCourses[courseId] || {
    id: courseId,
    name: 'Курс не найден',
    description: 'Запрошенный курс не существует',
    instructor: 'Неизвестно',
    enrolled: false
  };
  
  res.render('course', {
    title: course.name,
    user: sessionData?.userData || { name: 'Пользователь', email: 'unknown@example.com' },
    course: course
  });
});

// Страница 404
router.get('/404', (req, res) => {
  res.status(404).render('404', {
    title: 'Страница не найдена',
    userStatus: req.userStatus || 'unknown'
  });
});

// Отладочная страница
router.get('/debug', (req, res) => {
  res.json({
    userStatus: req.userStatus,
    sessionToken: req.sessionToken,
    sessionData: req.sessionData,
    cookies: req.cookies,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
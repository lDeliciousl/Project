const express = require('express');
const router = express.Router();
const mainApiClient = require('../utils/mainApiClient');
const sessionManager = require('../utils/session');
const authApiClient = require('../utils/authApiClient');

// Middleware: проверка авторизации и прав преподавателя/админа
function requireTeacher(req, res, next) {
  if (req.userStatus !== 'authenticated') {
    return res.redirect('/');
  }
  
  const user = req.sessionData?.userData;
  const roles = user?.roles || [];
  
  // Проверяем роль преподавателя или админа
  const isTeacher = roles.includes('teacher') || roles.includes('Преподаватель');
  const isAdmin = roles.includes('admin') || roles.includes('Админ');
  
  if (!isTeacher && !isAdmin) {
    return res.status(403).render('error', {
      title: 'Доступ запрещён',
      statusCode: 403,
      message: 'Эта страница доступна только преподавателям и администраторам.'
    });
  }
  
  next();
}

// Helper для запросов к main модулю
async function apiRequest(req, endpoint, method = 'get', data = null) {
  const { sessionToken, sessionData } = req;
  
  try {
    const result = await mainApiClient.requestWithRefresh({
      endpoint,
      method,
      data,
      sessionToken,
      sessionData,
      sessionManager,
      authApiClient
    });
    return result?.data;
  } catch (err) {
    console.error(`[Teacher API] Error ${method} ${endpoint}:`, err.message);
    throw err;
  }
}

// ========== ПАНЕЛЬ ПРЕПОДАВАТЕЛЯ ==========

router.get('/', requireTeacher, async (req, res) => {
  const user = req.sessionData?.userData || {};
  
  try {
    let courses = [];
    let myQuestions = [];
    let totalTests = 0;
    let totalStudents = 0;
    
    // Получаем все курсы и фильтруем по преподавателю
    try {
      const allCourses = await apiRequest(req, '/api/courses');
      if (Array.isArray(allCourses)) {
        courses = allCourses.filter(c => c.teacher_id === user.id || c.instructor_id === user.id);
      } else if (allCourses?.courses) {
        courses = allCourses.courses.filter(c => c.teacher_id === user.id || c.instructor_id === user.id);
      }
      
      // Подсчитываем статистику
      for (const course of courses) {
        totalTests += course.tests_count || 0;
        totalStudents += course.students_count || 0;
      }
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить курсы:', err.message);
    }
    
    // Получаем вопросы преподавателя
    try {
      const questions = await apiRequest(req, '/api/questions');
      if (Array.isArray(questions)) {
        myQuestions = questions.filter(q => q.author_id === user.id);
      } else if (questions?.questions) {
        myQuestions = questions.questions.filter(q => q.author_id === user.id);
      }
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить вопросы:', err.message);
    }
    
    res.render('teacher-dashboard', {
      title: 'Панель преподавателя',
      user,
      courses,
      myQuestions,
      totalTests,
      totalStudents
    });
  } catch (error) {
    console.error('[Teacher] Ошибка загрузки панели:', error);
    res.render('teacher-dashboard', {
      title: 'Панель преподавателя',
      user,
      courses: [],
      myQuestions: [],
      totalTests: 0,
      totalStudents: 0,
      error: 'Не удалось загрузить данные'
    });
  }
});

// ========== РЕДАКТИРОВАНИЕ КУРСА ==========

router.get('/course/:id', requireTeacher, async (req, res) => {
  const courseId = req.params.id;
  const user = req.sessionData?.userData || {};
  
  try {
    // Получаем информацию о курсе
    let course = null;
    try {
      course = await apiRequest(req, `/api/courses/${courseId}`);
    } catch (err) {
      console.error('[Teacher] Не удалось загрузить курс:', err.message);
      return res.status(404).render('error', {
        title: 'Курс не найден',
        statusCode: 404,
        message: 'Запрошенный курс не существует или недоступен.'
      });
    }
    
    if (!course) {
      return res.status(404).render('error', {
        title: 'Курс не найден',
        statusCode: 404,
        message: 'Запрошенный курс не существует.'
      });
    }
    
    // Получаем тесты курса
    let tests = [];
    try {
      const testsData = await apiRequest(req, `/api/courses/${courseId}/tests`);
      tests = testsData?.tests || testsData || [];
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить тесты курса:', err.message);
    }
    
    // Получаем студентов курса
    let students = [];
    try {
      const studentsData = await apiRequest(req, `/api/courses/${courseId}/students`);
      students = studentsData?.students || studentsData || [];
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить студентов:', err.message);
    }
    
    res.render('course-edit', {
      title: `Редактирование: ${course.name}`,
      user,
      course,
      tests,
      students
    });
  } catch (error) {
    console.error('[Teacher] Ошибка загрузки страницы курса:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить данные курса.'
    });
  }
});

// ========== РЕДАКТИРОВАНИЕ ТЕСТА ==========

router.get('/test/:id', requireTeacher, async (req, res) => {
  const testId = req.params.id;
  const user = req.sessionData?.userData || {};
  
  try {
    // Получаем информацию о тесте
    let test = null;
    try {
      test = await apiRequest(req, `/api/tests/${testId}`);
    } catch (err) {
      console.error('[Teacher] Не удалось загрузить тест:', err.message);
      return res.status(404).render('error', {
        title: 'Тест не найден',
        statusCode: 404,
        message: 'Запрошенный тест не существует или недоступен.'
      });
    }
    
    if (!test) {
      return res.status(404).render('error', {
        title: 'Тест не найден',
        statusCode: 404,
        message: 'Запрошенный тест не существует.'
      });
    }
    
    // Получаем информацию о курсе (если есть)
    let course = null;
    if (test.course_id) {
      try {
        course = await apiRequest(req, `/api/courses/${test.course_id}`);
      } catch (err) {
        console.warn('[Teacher] Не удалось загрузить курс теста:', err.message);
      }
    }
    
    // Получаем доступные вопросы (банк вопросов преподавателя)
    let availableQuestions = [];
    try {
      const questions = await apiRequest(req, '/api/questions');
      const allQuestions = questions?.questions || questions || [];
      
      // Фильтруем вопросы, которые уже в тесте
      const testQuestionIds = (test.questions || []).map(q => q.id);
      availableQuestions = allQuestions.filter(q => 
        (q.author_id === user.id) && !testQuestionIds.includes(q.id)
      );
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить вопросы:', err.message);
    }
    
    res.render('test-edit', {
      title: `Редактирование: ${test.name}`,
      user,
      test,
      course,
      availableQuestions
    });
  } catch (error) {
    console.error('[Teacher] Ошибка загрузки страницы теста:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить данные теста.'
    });
  }
});

// ========== РЕДАКТИРОВАНИЕ ВОПРОСА ==========

router.get('/question/new', requireTeacher, (req, res) => {
  const user = req.sessionData?.userData || {};
  
  res.render('question-edit', {
    title: 'Создание вопроса',
    user,
    question: {}
  });
});

router.get('/question/:id', requireTeacher, async (req, res) => {
  const questionId = req.params.id;
  const user = req.sessionData?.userData || {};
  
  try {
    // Получаем информацию о вопросе
    let question = null;
    try {
      question = await apiRequest(req, `/api/questions/${questionId}`);
    } catch (err) {
      console.error('[Teacher] Не удалось загрузить вопрос:', err.message);
      return res.status(404).render('error', {
        title: 'Вопрос не найден',
        statusCode: 404,
        message: 'Запрошенный вопрос не существует или недоступен.'
      });
    }
    
    if (!question) {
      return res.status(404).render('error', {
        title: 'Вопрос не найден',
        statusCode: 404,
        message: 'Запрошенный вопрос не существует.'
      });
    }
    
    res.render('question-edit', {
      title: `Редактирование: ${question.title || 'Вопрос'}`,
      user,
      question
    });
  } catch (error) {
    console.error('[Teacher] Ошибка загрузки страницы вопроса:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить данные вопроса.'
    });
  }
});

// ========== СПИСОК ВСЕХ ВОПРОСОВ ==========

router.get('/questions', requireTeacher, async (req, res) => {
  const user = req.sessionData?.userData || {};
  
  try {
    let myQuestions = [];
    
    try {
      const questions = await apiRequest(req, '/api/questions');
      const allQuestions = questions?.questions || questions || [];
      myQuestions = allQuestions.filter(q => q.author_id === user.id);
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить вопросы:', err.message);
    }
    
    res.render('questions-list', {
      title: 'Мои вопросы',
      user,
      questions: myQuestions
    });
  } catch (error) {
    console.error('[Teacher] Ошибка загрузки списка вопросов:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить список вопросов.'
    });
  }
});

module.exports = router;

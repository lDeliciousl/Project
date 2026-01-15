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
      authApiClient,
      res: req.res // Добавляем res для обработки ошибок
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
    const userId = user.id;
    const userMainUuid = user.main_uuid;
    
    // Получаем все курсы и фильтруем по преподавателю
    try {
      const allCourses = await apiRequest(req, '/api/courses');
      if (Array.isArray(allCourses)) {
        courses = allCourses.filter(c =>
          (userMainUuid && c.teacher_id === userMainUuid) ||
          (userId && c.teacher_external_id === userId)
        );
      } else if (allCourses?.courses) {
        courses = allCourses.courses.filter(c =>
          (userMainUuid && c.teacher_id === userMainUuid) ||
          (userId && c.teacher_external_id === userId)
        );
      }
      
      // Подсчитываем статистику
      for (const course of courses) {
        totalTests += course.tests_count || 0;
        totalStudents += course.students_count || 0;
      }
      
      // Получаем общее количество студентов (не только в курсах преподавателя)
      try {
        const usersResponse = await apiRequest(req, '/api/db/users');
        const allUsers = Array.isArray(usersResponse) ? usersResponse : (usersResponse && usersResponse.users ? usersResponse.users : []);
        
        // Считаем всех студентов
        totalStudents = allUsers.filter(user => {
          const roles = user.roles || '[]';
          return roles.includes('student') || roles.includes('Студент') || roles.includes('user');
        }).length;
      } catch (err) {
        console.warn('[Teacher] Не удалось получить общее количество студентов:', err.message);
      }
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить курсы:', err.message);
    }
    
    // Получаем вопросы преподавателя
    try {
      const questions = await apiRequest(req, '/api/questions');
      if (Array.isArray(questions)) {
        myQuestions = questions;
      } else if (questions?.questions) {
        myQuestions = questions.questions;
      }
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить вопросы:', err.message);
    }
    
    // Получаем количество заблокированных пользователей
    let bannedUsers = 0;
    try {
      const usersResponse = await apiRequest(req, '/api/db/users');
      const users = Array.isArray(usersResponse) ? usersResponse : (usersResponse && usersResponse.users ? usersResponse.users : []);
      
      let bannedUsersList = [];
      for (let user of users) {
        try {
          const blockResponse = await apiRequest(req, `/api/db/users/${user.id}/block`);
          if (blockResponse.is_blocked) {
            user.is_blocked = true;
            bannedUsersList.push(user);
          }
        } catch (error) {
          console.warn(`[Teacher] Не удалось получить статус блокировки для ${user.id}:`, error.message);
          user.is_blocked = false;
        }
      }
      bannedUsers = bannedUsersList.length;
    } catch (err) {
      console.warn('[Teacher] Не удалось получить количество заблокированных пользователей:', err.message);
    }
    
    res.render('teacher-dashboard', {
      title: 'Панель преподавателя',
      user,
      courses,
      myQuestions,
      totalTests,
      totalStudents,
      bannedUsers
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
      bannedUsers: 0
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
    
    // Получаем доступные вопросы (банк вопросов - свободные вопросы без test_id)
    let availableQuestions = [];
    try {
      const questions = await apiRequest(req, '/api/questions');
      const allQuestions = questions?.questions || questions || [];
      
      // Фильтруем: показываем только свободные вопросы (без test_id) 
      // или вопросы из других тестов, которые можно добавить
      const testQuestionIds = (test.questions || []).map(q => q.id);
      availableQuestions = allQuestions.filter(q => 
        !testQuestionIds.includes(q.id) && (!q.test_id || q.test_id === null)
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
  const testId = req.query.test || '';
  
  res.render('question-edit', {
    title: 'Создание вопроса',
    user,
    question: {},
    testId
  });
});

router.get('/question/:id', requireTeacher, async (req, res) => {
  const questionId = req.params.id;
  const user = req.sessionData?.userData || {};
  const testId = req.query.test || '';
  
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
      question,
      testId
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
      // Show all questions (no author_id filtering since it doesn't exist)
      myQuestions = allQuestions;
    } catch (err) {
      console.warn('[Teacher] Не удалось загрузить вопросы:', err.message);
    }
    
    res.render('questions-list', {
      title: 'Все вопросы',
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

// Страница студентов курса
router.get('/course/:id/students', requireTeacher, async (req, res) => {
  const courseId = req.params.id;
  
  try {
    // Получаем информацию о курсе
    const course = await apiRequest(req, `/api/courses/${courseId}`);
    
    if (!course || !course.id) {
      return res.status(404).render('error', {
        title: 'Курс не найден',
        statusCode: 404,
        message: 'Запрошенный курс не существует.'
      });
    }
    
    // Получаем студентов курса
    const students = await apiRequest(req, `/api/courses/${courseId}/students`);
    
    res.render('course-students', {
      title: `Студенты курса - ${course.name}`,
      course: course,
      students: students || []
    });
  } catch (error) {
    console.error(`[Teacher] Error loading students for course ${courseId}:`, error);
    
    if (error.status === 404) {
      return res.status(404).render('error', {
        title: 'Курс не найден',
        statusCode: 404,
        message: 'Запрошенный курс не существует.'
      });
    }
    
    if (error.status === 403) {
      return res.status(403).render('error', {
        title: 'Доступ запрещён',
        statusCode: 403,
        message: 'У вас нет доступа к этому курсу.'
      });
    }
    
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить список студентов.'
    });
  }
});

// Страница результатов студента
router.get('/student/:studentId/results', requireTeacher, async (req, res) => {
  const studentId = req.params.studentId;
  
  try {
    // Получаем всех пользователей и находим нужного студента
    const usersResponse = await apiRequest(req, '/api/db/users');
    const users = Array.isArray(usersResponse) ? usersResponse : (usersResponse && usersResponse.users ? usersResponse.users : []);
    
    // Ищем студента по ID
    const student = users.find(user => user.id === studentId);
    
    if (!student) {
      return res.status(404).render('error', {
        title: 'Студент не найден',
        statusCode: 404,
        message: 'Запрошенный студент не существует.'
      });
    }
    
    // Получаем тесты студента
    const testsResponse = await apiRequest(req, `/api/db/users/${studentId}/tests`);
    const allTests = testsResponse?.tests || [];
    
    // Если есть courseId в query, фильтруем тесты курса
    const courseId = req.query.course;
    let testResults = allTests;
    if (courseId) {
      testResults = allTests.filter(test => test.course_id === courseId);
    }
    
    // Получаем информацию о курсе если нужно
    let course = null;
    if (courseId) {
      course = await apiRequest(req, `/api/courses/${courseId}`);
    }
    
    res.render('student-results', {
      title: `Результаты студента - ${student.name || student.email}`,
      student: student,
      course: course,
      testResults: testResults
    });
  } catch (error) {
    console.error(`[Teacher] Error loading student results ${studentId}:`, error);
    
    if (error.status === 404) {
      return res.status(404).render('error', {
        title: 'Студент не найден',
        statusCode: 404,
        message: 'Запрошенный студент не существует.'
      });
    }
    
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить результаты студента.'
    });
  }
});

// Страница всех студентов
router.get('/students', requireTeacher, async (req, res) => {
  try {
    // Получаем всех студентов напрямую из базы через main модуль
    const response = await apiRequest(req, '/api/db/users');
    console.log('[Teacher] Users response:', response);
    
    // Проверяем, что response - это массив
    const students = Array.isArray(response) ? response : (response && response.users ? response.users : []);
    console.log('[Teacher] Students array:', students);
    
    // Фильтруем только студентов (не преподавателей и не админов)
    let allStudents = students.filter(user => {
      const roles = user.roles || '[]';
      return roles.includes('student') || roles.includes('Студент') || roles.includes('user');
    });
    
    // Получаем статус блокировки для каждого студента
    const accessToken = req.sessionData?.accessToken;
    for (let student of allStudents) {
      try {
        const blockResponse = await apiRequest(req, `/api/db/users/${student.id}/block`);
        student.is_blocked = blockResponse.is_blocked || false;
      } catch (error) {
        console.warn(`[Teacher] Не удалось получить статус блокировки для ${student.id}:`, error.message);
        student.is_blocked = false;
      }
    }
    
    const totalStudents = allStudents.length;
    
    res.render('students-list', {
      title: 'Студенты - Система тестирования',
      students: allStudents,
      totalStudents: totalStudents,
      totalCourses: 0,
      activeStudents: totalStudents
    });
  } catch (error) {
    console.error('[Teacher] Error loading students list:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить список студентов.'
    });
  }
});

// Страница заблокированных пользователей
router.get('/banned-users', requireTeacher, async (req, res) => {
  try {
    // Получаем всех пользователей
    const response = await apiRequest(req, '/api/db/users');
    const users = Array.isArray(response) ? response : (response && response.users ? response.users : []);
    
    // Получаем статус блокировки для каждого пользователя
    const accessToken = req.sessionData?.accessToken;
    let bannedUsersList = [];
    
    for (let user of users) {
      try {
        const blockResponse = await apiRequest(req, `/api/db/users/${user.id}/block`);
        if (blockResponse.is_blocked) {
          user.is_blocked = true;
          bannedUsersList.push(user);
        }
      } catch (error) {
        console.warn(`[Teacher] Не удалось получить статус блокировки для ${user.id}:`, error.message);
        user.is_blocked = false;
      }
    }
    
    res.render('banned-users', {
      title: 'Заблокированные пользователи - Система тестирования',
      bannedUsers: bannedUsersList,
      totalUsers: users.length,
      sessionData: req.sessionData
    });
  } catch (error) {
    console.error('[Teacher] Error loading banned users:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить список заблокированных пользователей.'
    });
  }
});

// Страница ответов студента на тест
router.get('/test/:testId/student/:studentId/answers', requireTeacher, async (req, res) => {
  const { testId, studentId } = req.params;
  
  try {
    // Получаем информацию о студенте
    const usersResponse = await apiRequest(req, '/api/db/users');
    const users = Array.isArray(usersResponse) ? usersResponse : (usersResponse && usersResponse.users ? usersResponse.users : []);
    const student = users.find(user => user.id === studentId);
    
    if (!student) {
      return res.status(404).render('error', {
        title: 'Студент не найден',
        statusCode: 404,
        message: 'Запрошенный студент не существует.'
      });
    }
    
    // Получаем информацию о тесте
    const test = await apiRequest(req, `/api/tests/${testId}`);
    
    if (!test || !test.id) {
      return res.status(404).render('error', {
        title: 'Тест не найден',
        statusCode: 404,
        message: 'Запрошенный тест не существует.'
      });
    }
    
    // Получаем попытку студента
    const attempts = await apiRequest(req, `/api/db/users/${studentId}/tests`);
    console.log(`[Teacher] Student ${studentId} attempts:`, attempts);
    const studentAttempts = attempts?.tests || [];
    console.log(`[Teacher] Looking for test ${testId} in ${studentAttempts.length} attempts`);
    console.log(`[Teacher] Available test IDs:`, studentAttempts.map(a => ({ id: a.id, name: a.name, attempt_id: a.attempt_id })));
    const attempt = studentAttempts.find(a => a.id === testId);
    console.log(`[Teacher] Found attempt:`, attempt);
    
    if (!attempt) {
      return res.status(404).render('error', {
        title: 'Попытка не найдена',
        statusCode: 404,
        message: 'Студент не проходил этот тест.'
      });
    }
    
    // Получаем ответы студента
    const answersResponse = await apiRequest(req, `/api/attempts/${attempt.attempt_id}/answers`);
    const answers = answersResponse?.answers || [];
    
    // Получаем информацию о курсе если нужно
    let course = null;
    if (test.course_id) {
      try {
        course = await apiRequest(req, `/api/courses/${test.course_id}`);
      } catch (err) {
        console.warn('Не удалось получить информацию о курсе:', err.message);
      }
    }
    
    // Считаем статистику
    const correctAnswers = answers.filter(a => a.is_correct).length;
    
    res.render('test-answers', {
      title: `Ответы студента - ${test.name}`,
      student: student,
      test: test,
      course: course,
      attempt: attempt,
      answers: answers,
      correctAnswers: correctAnswers
    });
  } catch (error) {
    console.error(`[Teacher] Error loading test answers:`, error);
    res.status(500).render('error', {
      title: 'Ошибка',
      statusCode: 500,
      message: 'Не удалось загрузить ответы студента.'
    });
  }
});

module.exports = router;

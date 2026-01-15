const express = require('express');
const router = express.Router();

// Тестовая страница дисциплин без middleware
router.get('/', async (req, res) => {
  try {
    const mainApiClient = require('../utils/mainApiClient');
    
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

module.exports = router;

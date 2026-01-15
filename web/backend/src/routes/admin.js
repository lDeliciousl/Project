const express = require('express');
const router = express.Router();
const authApiClient = require('../utils/authApiClient');

// Middleware для проверки роли администратора
function requireAdmin(req, res, next) {
  const { user } = req;
  console.log('[ADMIN DEBUG] User object:', JSON.stringify(user, null, 2));
  console.log('[ADMIN DEBUG] User roles:', user?.roles);
  
  if (!user || !user.roles || (!user.roles.includes('admin') && !user.roles.includes('Администратор'))) {
    console.log('[ADMIN DEBUG] Access denied - user roles do not include admin or Администратор');
    return res.status(403).render('error', {
      title: 'Доступ запрещен',
      message: 'Только администраторы могут управлять пользователями.'
    });
  }
  console.log('[ADMIN DEBUG] Access granted - user has admin role');
  next();
}

// Страница управления пользователями
router.get('/users', requireAdmin, async (req, res) => {
  try {
    // Получаем токен из сессии
    const accessToken = req.sessionData?.accessToken;
    console.log('[ADMIN USERS] Session data keys:', Object.keys(req.sessionData || {}));
    console.log('[ADMIN USERS] AccessToken present:', !!accessToken);
    console.log('[ADMIN USERS] AccessToken preview:', accessToken ? accessToken.substring(0, 20) + '...' : 'none');
    
    if (!accessToken) {
      return res.status(401).render('error', {
        title: 'Ошибка авторизации',
        message: 'Токен доступа не найден. Войдите снова.'
      });
    }

    // Получаем список пользователей из auth-module
    console.log('[ADMIN USERS] Fetching users with token:', accessToken ? 'present' : 'missing');
    const usersResponse = await authApiClient.request('/api/auth/users', 'get', null, {
      'Authorization': `Bearer ${accessToken}`
    });
    console.log('[ADMIN USERS] Users response:', JSON.stringify(usersResponse, null, 2));

    const users = usersResponse.users || [];

    res.render('admin-users', {
      title: 'Управление пользователями',
      user: req.user,
      users: users,
      error: null,
      success: null
    });

  } catch (error) {
    console.error('[ADMIN USERS] Error:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось загрузить список пользователей.'
    });
  }
});

// Эндпоинт для изменения ролей пользователя
router.put('/users/:userId/roles', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { roles } = req.body;

    if (!Array.isArray(roles)) {
      return res.status(400).json({ error: 'Roles must be an array' });
    }

    // Проверяем, что роли валидны
    const validRoles = ['Студент', 'Преподаватель', 'Администратор', 'teacher', 'admin'];
    const invalidRoles = roles.filter(role => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      return res.status(400).json({ error: `Invalid roles: ${invalidRoles.join(', ')}` });
    }

    // Вызываем auth-module для обновления ролей
    const accessToken = req.sessionData?.accessToken;
    const response = await authApiClient.updateUserRoles(userId, roles, accessToken);

    res.json(response);

  } catch (error) {
    console.error('[ADMIN UPDATE ROLES] Error:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to update user roles' 
    });
  }
});

module.exports = router;

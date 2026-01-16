const mainApiClient = require('../utils/mainApiClient');
const sessionManager = require('../utils/session');
const authApiClient = require('../utils/authApiClient');

// Централизованная функция получения актуального имени пользователя
async function getActualUserName(req, userId) {
  if (!userId || !req.sessionData?.accessToken) {
    return req.sessionData?.userData?.name || 'Пользователь';
  }
  
  try {
    const nameResp = await mainApiClient.requestWithRefresh({
      endpoint: `/api/db/users/${userId}/name`,
      method: 'get',
      sessionToken: req.sessionToken,
      sessionData: req.sessionData,
      sessionManager,
      authApiClient,
      res: req.res
    });
    
    const actualName = nameResp?.data?.name;
    if (actualName) {
      // Обновляем имя в сессии для кэширования
      if (req.sessionData?.userData) {
        req.sessionData.userData.name = actualName;
      }
      console.log(`[UTILS] Актуальное имя получено: ${actualName}`);
      return actualName;
    }
  } catch (err) {
    console.warn('[UTILS] Не удалось получить актуальное имя:', err.message);
  }
  
  // Фоллбек на имя из сессии
  return req.sessionData?.userData?.name || 'Пользователь';
}

module.exports = {
  getActualUserName
};

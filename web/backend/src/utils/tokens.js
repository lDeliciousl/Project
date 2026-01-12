const crypto = require('crypto');

function generateLoginToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateShortCode() {
  // Генерация 6-значного кода
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = {
  generateLoginToken,
  generateSessionToken,
  generateShortCode
};
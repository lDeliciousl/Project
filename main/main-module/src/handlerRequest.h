#pragma once

#include <httplib.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <nlohmann/json.hpp>
#include "checkToken.h"

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

std::string matchToString(const std::smatch& match, size_t index = 1);
int matchToInt(const std::smatch& match, size_t index = 1);

// ============================================================================
// ФУНКЦИИ ДЛЯ ПРОВЕРКИ ДОСТУПА
// ============================================================================

bool Unauthorized(httplib::Response& res, std::unordered_map<std::string, jwt_stub::claim> permission);
bool CheckAccess(std::unordered_map<std::string, jwt_stub::claim> permission, std::string value, httplib::Response& res);
bool IsThisUser(std::unordered_map<std::string, jwt_stub::claim> permission, int uid, httplib::Response& res);

// ============================================================================
// SQL ЗАГЛУШКИ
// ============================================================================

std::vector<int> sql_get_list_int(const std::string& column, const std::string& table);
std::vector<std::string> sql_get_list_str(const std::string& column, const std::string& table);

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

void SetConsoleOutputCP(int code);
std::string get_db_name();
std::string get_db_password();
int getUidFromJson(const std::string& json);

// ============================================================================
// ОБРАБОТЧИКИ API
// ============================================================================

void AddUserHandler(const httplib::Request& req, httplib::Response& res);
void GetUserListHandler(const httplib::Request& req, httplib::Response& res);
void GetUserNameHandler(const httplib::Request& req, httplib::Response& res);
void SetUserNameHandler(const httplib::Request& req, httplib::Response& res);
void GetUserCoursesHandler(const httplib::Request& req, httplib::Response& res);
void GetUserGradesHandler(const httplib::Request& req, httplib::Response& res);
void GetUserTestsHandler(const httplib::Request& req, httplib::Response& res);
void GetUserRolesHandler(const httplib::Request& req, httplib::Response& res);
void SetUserRolesHandler(const httplib::Request& req, httplib::Response& res);

// ============================================================================
// ПРОСТЫЕ ОБРАБОТЧИКИ
// ============================================================================

void handleGetRequest(const httplib::Request& req, httplib::Response& res);
void handlePostRequest(const httplib::Request& req, httplib::Response& res);

// Пример обработчика, который парсит JSON-тело запроса (создание попытки теста)
void CreateTestAttemptHandler(const httplib::Request& req, httplib::Response& res);

// Новые обработчики для тестов
void CreateTestHandler(const httplib::Request& req, httplib::Response& res);
void AddQuestionHandler(const httplib::Request& req, httplib::Response& res);
void GetTestDetailsHandler(const httplib::Request& req, httplib::Response& res);
void GetTestsHandler(const httplib::Request& req, httplib::Response& res);

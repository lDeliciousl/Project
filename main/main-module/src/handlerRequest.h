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

bool Unauthorized(httplib::Response& res, const AuthContext& ctx);
bool CheckAccess(const AuthContext& ctx, const std::string& value, httplib::Response& res);
bool IsThisUser(const AuthContext& ctx, const std::string& uid, httplib::Response& res);

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

void GetUserBlockedHandler(const httplib::Request& req, httplib::Response& res);
void SetUserBlockedHandler(const httplib::Request& req, httplib::Response& res);

void GetNotificationsHandler(const httplib::Request& req, httplib::Response& res);
void ClearNotificationsHandler(const httplib::Request& req, httplib::Response& res);

// Courses API
void GetCoursesListHandler(const httplib::Request& req, httplib::Response& res);
void GetCourseInfoHandler(const httplib::Request& req, httplib::Response& res);
void CreateCourseHandler(const httplib::Request& req, httplib::Response& res);
void UpdateCourseHandler(const httplib::Request& req, httplib::Response& res);
void DeleteCourseHandler(const httplib::Request& req, httplib::Response& res);
void GetCourseStudentsHandler(const httplib::Request& req, httplib::Response& res);
void GetCourseTestsHandler(const httplib::Request& req, httplib::Response& res);
void EnrollUserHandler(const httplib::Request& req, httplib::Response& res);
void UnenrollUserHandler(const httplib::Request& req, httplib::Response& res);

// Test activation
void ActivateTestHandler(const httplib::Request& req, httplib::Response& res);

// Questions API
void GetQuestionsListHandler(const httplib::Request& req, httplib::Response& res);
void GetQuestionHandler(const httplib::Request& req, httplib::Response& res);
void GetQuestionVersionsHandler(const httplib::Request& req, httplib::Response& res);
void CreateQuestionHandler(const httplib::Request& req, httplib::Response& res);
void UpdateQuestionHandler(const httplib::Request& req, httplib::Response& res);
void DeleteQuestionHandler(const httplib::Request& req, httplib::Response& res);
void DeleteQuestionVersionHandler(const httplib::Request& req, httplib::Response& res);

// Test questions management
void AddQuestionToTestHandler(const httplib::Request& req, httplib::Response& res);
void RemoveQuestionFromTestHandler(const httplib::Request& req, httplib::Response& res);
void UpdateQuestionsOrderHandler(const httplib::Request& req, httplib::Response& res);

// Attempts API
void GetAttemptHandler(const httplib::Request& req, httplib::Response& res);
void GetAttemptAnswersHandler(const httplib::Request& req, httplib::Response& res);
void FinishAttemptHandler(const httplib::Request& req, httplib::Response& res);
void CreateAnswerHandler(const httplib::Request& req, httplib::Response& res);
void UpdateAnswerHandler(const httplib::Request& req, httplib::Response& res);
void GetUserAttemptForTestHandler(const httplib::Request& req, httplib::Response& res);

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
void UpdateTestHandler(const httplib::Request& req, httplib::Response& res);
void DeleteTestHandler(const httplib::Request& req, httplib::Response& res);

// Test results API (по ТЗ: test:answer:read)
void GetTestUsersHandler(const httplib::Request& req, httplib::Response& res);
void GetTestGradesHandler(const httplib::Request& req, httplib::Response& res);
void GetTestAnswersHandler(const httplib::Request& req, httplib::Response& res);

// Answers API (по ТЗ: answer:read/update/del)
void GetAnswerHandler(const httplib::Request& req, httplib::Response& res);
void DeleteAnswerHandler(const httplib::Request& req, httplib::Response& res);

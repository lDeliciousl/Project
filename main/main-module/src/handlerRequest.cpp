#include "handlerRequest.h"
#include "postgres.h"
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
#include <libpq-fe.h>
#include <nlohmann/json.hpp>

// ============================================================================
// ЗАГЛУШКИ ДЛЯ ФУНКЦИЙ
// ============================================================================

static bool IsBlockedUser(const AuthContext& ctx) {
    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        return false;
    }

    const char* paramValues[1];
    paramValues[0] = ctx.user_id.c_str();
    PGresult* result = PQexecParams(
        conn,
        "SELECT is_blocked FROM users WHERE id = $1",
        1,
        nullptr,
        paramValues,
        nullptr,
        nullptr,
        0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK || PQntuples(result) == 0) {
        PQclear(result);
        return false;
    }

    std::string v = PQgetvalue(result, 0, 0);
    PQclear(result);
    return v == "t" || v == "true" || v == "1";
}

bool Unauthorized(httplib::Response& res, const AuthContext& ctx) {
    if (!ctx.authorized) {
        res.status = 401;
        res.set_content("{\"error\": \"Unauthorized\"}", "application/json");
        return true;
    }

    if (IsBlockedUser(ctx)) {
        res.status = 418;
        res.set_content("{\"error\": \"Blocked\"}", "application/json");
        return true;
    }

    return false;
}

bool CheckAccess(const AuthContext& ctx, const std::string& value, httplib::Response& res) {
    const bool ok =
        std::find(ctx.permissions.begin(), ctx.permissions.end(), "*") != ctx.permissions.end() ||
        std::find(ctx.permissions.begin(), ctx.permissions.end(), value) != ctx.permissions.end();
    if (!ok) {
        res.status = 403;
        res.set_content("{\"error\": \"Forbidden\"}", "application/json");
        return false;
    }
    return true;
}

bool IsThisUser(const AuthContext& ctx, const std::string& uid, httplib::Response& res) {
    (void)res;
    return ctx.user_id == uid;
}

// Реальные SQL функции
std::vector<int> sql_get_list_int(const std::string& column, const std::string& table) {
    Database& db = Database::get_instance();
    return db.getIntList(column, table);
}

std::vector<std::string> sql_get_list_str(const std::string& column, const std::string& table) {
    Database& db = Database::get_instance();
    return db.getStringList(column, table);
}

// Заглушки для Windows функций
void SetConsoleOutputCP(int code) {
    // Ничего не делаем на macOS
    std::cout << "[STUB] SetConsoleOutputCP(" << code << ") called" << std::endl;
}

std::string get_db_name() {
    return "testdb";
}

std::string get_db_password() {
    return "testpass";
}

// Заглушка для JSON парсинга
int getUidFromJson(const std::string& json) {
    // Простая заглушка - всегда возвращаем 1
    return 1;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

// Функция для преобразования match в строку
std::string matchToString(const std::smatch& match, size_t index) {
    if (index < match.size()) {
        return match[index].str();
    }
    return "";
}

// Функция для преобразования match в int
int matchToInt(const std::smatch& match, size_t index) {
    try {
        return std::stoi(matchToString(match, index));
    } catch (...) {
        return 0;
    }
}

// ============================================================================
// РЕАЛИЗАЦИЯ ФУНКЦИЙ ИЗ handlerRequest.h
// ============================================================================

void AddUserHandler(const httplib::Request& req, httplib::Response& res) {
    std::cout << "[AddUserHandler] Called" << std::endl;
    
    // Проверка токена
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;
    
    // Проверка доступа
    if (!CheckAccess(ctx, "user:add", res)) return;
    
    // Простая логика добавления пользователя
    try {
        int uid = getUidFromJson(req.body);
        std::cout << "[AddUserHandler] Adding user with UID: " << uid << std::endl;
        
        res.set_content("{\"status\": \"success\", \"message\": \"User added (stub)\", \"uid\": " + std::to_string(uid) + "}", "application/json");
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
    }
}

void GetUserListHandler(const httplib::Request& req, httplib::Response& res) {
    std::cout << "[GetUserListHandler] Called" << std::endl;
    
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "user:list:read", res)) return;
    
    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }
    
    // Получаем данные из БД
    std::string query = "SELECT id::text, email, full_name FROM users ORDER BY created_at";
    PGresult* result = PQexec(conn, query.c_str());
    
    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }
    
    // Формируем JSON ответ
    nlohmann::json json_response;
    nlohmann::json users_array = nlohmann::json::array();
    
    int rows = PQntuples(result);
    for (int i = 0; i < rows; i++) {
        nlohmann::json user;
        user["id"] = PQgetvalue(result, i, 0);
        user["email"] = PQgetvalue(result, i, 1);
        user["name"] = PQgetvalue(result, i, 2) ? PQgetvalue(result, i, 2) : "";
        users_array.push_back(user);
    }
    
    json_response["users"] = users_array;
    PQclear(result);
    
    res.set_content(json_response.dump(), "application/json");
}

// Обработчик для получения имени пользователя
void GetUserNameHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserNameHandler] Called for user: " << userId << std::endl;
    
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    // По умолчанию разрешаем смотреть ФИО (по task_flow), но оставляем блокировку
    
    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }
    
    // Получаем имя пользователя из БД
    const char* paramValues[1];
    paramValues[0] = userId.c_str();
    PGresult* result = PQexecParams(
        conn,
        "SELECT id::text, full_name FROM users WHERE id = $1",
        1,
        nullptr,
        paramValues,
        nullptr,
        nullptr,
        0);
    
    if (PQresultStatus(result) != PGRES_TUPLES_OK || PQntuples(result) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"User not found\"}", "application/json");
        PQclear(result);
        return;
    }
    
    nlohmann::json json_response;
    json_response["id"] = PQgetvalue(result, 0, 0);
    json_response["name"] = PQgetvalue(result, 0, 1) ? PQgetvalue(result, 0, 1) : "";
    
    PQclear(result);
    res.set_content(json_response.dump(), "application/json");
}

// Остальные обработчики - аналогичные заглушки
void SetUserNameHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[SetUserNameHandler] Called for user: " << userId << std::endl;
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    // Себе можно по умолчанию, другому - только при наличии permission
    if (!IsThisUser(ctx, userId, res)) {
        if (!CheckAccess(ctx, "user:fullName:write", res)) return;
    }

    res.set_content("{\"status\": \"success\", \"message\": \"Name updated for user " + userId + "\"}", "application/json");
}

void GetUserCoursesHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserCoursesHandler] Called for user: " << userId << std::endl;
    
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    // По умолчанию о себе можно, о другом - нужен доступ
    if (!IsThisUser(ctx, userId, res)) {
        if (!CheckAccess(ctx, "user:data:read", res)) return;
    }
    
    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }
    
    // Получаем курсы пользователя из БД
    const char* paramValues[1];
    paramValues[0] = userId.c_str();
    PGresult* result = PQexecParams(
        conn,
        "SELECT c.id::text, c.name, c.description, u.full_name as teacher_name "
        "FROM courses c "
        "JOIN user_courses uc ON c.id = uc.course_id "
        "LEFT JOIN users u ON c.teacher_id = u.id "
        "WHERE uc.user_id = $1 AND c.is_deleted = FALSE",
        1,
        nullptr,
        paramValues,
        nullptr,
        nullptr,
        0);
    
    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }
    
    nlohmann::json json_response;
    nlohmann::json courses_array = nlohmann::json::array();
    
    int rows = PQntuples(result);
    for (int i = 0; i < rows; i++) {
        nlohmann::json course;
        course["id"] = PQgetvalue(result, i, 0);
        course["name"] = PQgetvalue(result, i, 1);
        course["description"] = PQgetvalue(result, i, 2) ? PQgetvalue(result, i, 2) : "";
        course["instructor"] = PQgetvalue(result, i, 3) ? PQgetvalue(result, i, 3) : "";
        course["enrolled"] = true;
        courses_array.push_back(course);
    }
    
    json_response["courses"] = courses_array;
    PQclear(result);
    
    res.set_content(json_response.dump(), "application/json");
}

void GetUserGradesHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserGradesHandler] Called for user: " << userId << std::endl;
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!IsThisUser(ctx, userId, res)) {
        if (!CheckAccess(ctx, "user:data:read", res)) return;
    }

    res.set_content("{\"grades\": {\"Math\": 85, \"Physics\": 90, \"Chemistry\": 78}}", "application/json");
}

void GetUserTestsHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserTestsHandler] Called for user: " << userId << std::endl;
    
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!IsThisUser(ctx, userId, res)) {
        if (!CheckAccess(ctx, "user:data:read", res)) return;
    }
    
    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }
    
    // Получаем тесты пользователя (попытки прохождения тестов)
    const char* paramValues[1];
    paramValues[0] = userId.c_str();
    PGresult* result = PQexecParams(
        conn,
        "SELECT t.id::text, t.name, ta.score, ta.max_score, ta.status, ta.finished_at "
        "FROM test_attempts ta "
        "JOIN tests t ON ta.test_id = t.id "
        "WHERE ta.user_id = $1 "
        "ORDER BY ta.started_at DESC",
        1,
        nullptr,
        paramValues,
        nullptr,
        nullptr,
        0);
    
    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }
    
    nlohmann::json json_response;
    nlohmann::json tests_array = nlohmann::json::array();
    
    int rows = PQntuples(result);
    for (int i = 0; i < rows; i++) {
        nlohmann::json test;
        test["id"] = PQgetvalue(result, i, 0);
        test["name"] = PQgetvalue(result, i, 1);
        test["score"] = PQgetvalue(result, i, 2) ? std::stoi(PQgetvalue(result, i, 2)) : 0;
        test["max_score"] = PQgetvalue(result, i, 3) ? std::stoi(PQgetvalue(result, i, 3)) : 0;
        test["completed"] = (std::string(PQgetvalue(result, i, 4)) == "completed");
        test["date"] = PQgetvalue(result, i, 5) ? PQgetvalue(result, i, 5) : "";
        tests_array.push_back(test);
    }
    
    json_response["tests"] = tests_array;
    PQclear(result);
    
    res.set_content(json_response.dump(), "application/json");
}

void GetUserRolesHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserRolesHandler] Called for user: " << userId << std::endl;
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "user:roles:read", res)) return;
    res.set_content("{\"roles\": [\"student\", \"user\"]}", "application/json");
}

void SetUserRolesHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[SetUserRolesHandler] Called for user: " << userId << std::endl;
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "user:roles:write", res)) return;
    res.set_content("{\"status\": \"success\", \"message\": \"Roles updated\"}", "application/json");
}

void GetUserBlockedHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserBlockedHandler] Called for user: " << userId << std::endl;

    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "user:block:read", res)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = userId.c_str();
    PGresult* result = PQexecParams(
        conn,
        "SELECT id::text, is_blocked FROM users WHERE id = $1",
        1,
        nullptr,
        paramValues,
        nullptr,
        nullptr,
        0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK || PQntuples(result) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"User not found\"}", "application/json");
        PQclear(result);
        return;
    }

    std::string v = PQgetvalue(result, 0, 1);
    const bool is_blocked = (v == "t" || v == "true" || v == "1");
    nlohmann::json json_response;
    json_response["id"] = PQgetvalue(result, 0, 0);
    json_response["is_blocked"] = is_blocked;
    PQclear(result);
    res.set_content(json_response.dump(), "application/json");
}

void SetUserBlockedHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[SetUserBlockedHandler] Called for user: " << userId << std::endl;

    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "user:block:write", res)) return;

    bool is_blocked = false;
    try {
        auto body = nlohmann::json::parse(req.body);
        is_blocked = body.at("is_blocked").get<bool>();
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    std::string blocked_str = is_blocked ? "true" : "false";
    const char* paramValues[2];
    paramValues[0] = blocked_str.c_str();
    paramValues[1] = userId.c_str();
    PGresult* result = PQexecParams(
        conn,
        "UPDATE users SET is_blocked = $1 WHERE id = $2",
        2,
        nullptr,
        paramValues,
        nullptr,
        nullptr,
        0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void GetNotificationsHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = ctx.user_id.c_str();
    PGresult* result = PQexecParams(
        conn,
        "SELECT id::text, message, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at",
        1,
        nullptr,
        paramValues,
        nullptr,
        nullptr,
        0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }

    nlohmann::json json_response;
    nlohmann::json arr = nlohmann::json::array();
    int rows = PQntuples(result);
    for (int i = 0; i < rows; i++) {
        nlohmann::json item;
        item["id"] = PQgetvalue(result, i, 0);
        item["message"] = PQgetvalue(result, i, 1);
        item["created_at"] = PQgetvalue(result, i, 2) ? PQgetvalue(result, i, 2) : "";
        arr.push_back(item);
    }
    PQclear(result);
    json_response["notifications"] = arr;
    res.set_content(json_response.dump(), "application/json");
}

void ClearNotificationsHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = ctx.user_id.c_str();
    PGresult* result = PQexecParams(
        conn,
        "DELETE FROM notifications WHERE user_id = $1",
        1,
        nullptr,
        paramValues,
        nullptr,
        nullptr,
        0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Delete failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

// ============================================================================
// ПРОСТЫЕ ОБРАБОТЧИКИ ДЛЯ ОСНОВНЫХ МЕТОДОВ
// ============================================================================

void handleGetRequest(const httplib::Request& req, httplib::Response& res) {
    std::cout << "GET request to: " << req.path << std::endl;
    
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;
    res.set_content("{\"status\": \"success\", \"message\": \"Authorized\", \"path\": \"" + req.path + "\"}", "application/json");
}

void handlePostRequest(const httplib::Request& req, httplib::Response& res) {
    std::cout << "POST request to: " << req.path << std::endl;
    std::cout << "Body: " << req.body.substr(0, 100) << (req.body.length() > 100 ? "..." : "") << std::endl;
    
    res.set_content("{\"status\": \"received\", \"path\": \"" + req.path + "\"}", "application/json");
}

// ============================================================================
// ПРИМЕР ОБРАБОТЧИКА С РЕАЛЬНЫМ JSON-ПАРСИНГОМ
// ============================================================================

void CreateTestAttemptHandler(const httplib::Request& req, httplib::Response& res) {
    std::cout << "[CreateTestAttemptHandler] POST " << req.path << std::endl;
    std::cout << "Body: " << req.body << std::endl;

    // 1) Проверяем токен и права (пока заглушки)
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "test:attempt:create", res)) return;

    try {
        // 2) Разбираем JSON-тело запроса
        nlohmann::json body = nlohmann::json::parse(req.body);

        std::string test_id  = body.at("test_id").get<std::string>();
        std::string user_id  = body.at("user_id").get<std::string>();

        // 3) Получаем экземпляр БД и создаем попытку теста
        Database& db = Database::get_instance();
        std::string attempt_id = db.create_test_attempt(test_id, user_id);
        
        if (attempt_id.empty()) {
            res.status = 500;
            res.set_content("{\"error\": \"Failed to create test attempt\"}", "application/json");
            return;
        }

        // 4) Сохраняем ответы если они есть
        std::vector<Answer> answers;
        if (body.contains("answers") && body["answers"].is_array()) {
            for (const auto& answer_json : body["answers"]) {
                Answer answer;
                answer.question_id = answer_json.at("question_id").get<std::string>();
                answer.option_id = answer_json.at("option_id").get<std::string>();
                answers.push_back(answer);
            }
            
            if (!answers.empty()) {
                if (!db.save_attempt_answers(attempt_id, answers)) {
                    std::cerr << "[CreateTestAttemptHandler] Warning: Failed to save some answers" << std::endl;
                }
            }
        }

        // 5) Подсчитываем результат - считаем правильные ответы из БД
        int correct_count = 0;
        int total_count = answers.size();
        
        if (!answers.empty()) {
            // Подсчитываем правильные ответы из БД
            correct_count = db.count_correct_answers(attempt_id);
            
            // Подсчитываем максимальный балл (упрощенно - по количеству вопросов)
            int max_score = total_count;
            db.finish_test_attempt(attempt_id, correct_count, max_score);
        }

        std::cout << "[CreateTestAttemptHandler] Created attempt: " << attempt_id
                  << " with " << answers.size() << " answers" << std::endl;

        // 7) Формируем JSON-ответ
        nlohmann::json resp;
        resp["status"] = "success";
        resp["message"] = "Test attempt created successfully";
        resp["attempt_id"] = attempt_id;
        resp["test_id"] = test_id;
        resp["user_id"] = user_id;
        resp["answers_count"] = answers.size();
        resp["score"] = correct_count;
        resp["max_score"] = total_count;

        res.status = 201;
        res.set_content(resp.dump(), "application/json");
    } catch (const nlohmann::json::exception& ex) {
        std::cerr << "[CreateTestAttemptHandler] JSON Error: " << ex.what() << std::endl;
        res.status = 400;
        res.set_content("{\"error\": \"Invalid JSON body: " + std::string(ex.what()) + "\"}", "application/json");
    } catch (const std::exception& ex) {
        std::cerr << "[CreateTestAttemptHandler] Error: " << ex.what() << std::endl;
        res.status = 500;
        res.set_content("{\"error\": \"Internal server error\"}", "application/json");
    }
}

// ============================================================================
// НОВЫЕ ОБРАБОТЧИКИ
// ============================================================================

void CreateTestHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;
    
    // Check if user is teacher/admin (stub check)
    if (!CheckAccess(ctx, "course:test:add", res)) return;

    try {
        auto body = nlohmann::json::parse(req.body);
        std::string name = body.at("name").get<std::string>();
        std::string desc = body.value("description", "");
        std::string course_id = body.at("course_id").get<std::string>();
        std::string created_by = body.at("created_by").get<std::string>();

        Database& db = Database::get_instance();
        std::string id = db.create_test(name, desc, course_id, created_by);
        
        if (id.empty()) {
            res.status = 500;
            res.set_content("{\"error\": \"Failed to create test\"}", "application/json");
        } else {
            res.status = 201;
            nlohmann::json response;
            response["status"] = "success";
            response["id"] = id;
            res.set_content(response.dump(), "application/json");
        }
    } catch (const std::exception& e) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
    }
}

void AddQuestionHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "quest:create", res)) return;
    
    // Extract test_id from path
    std::string test_id = matchToString(req.matches, 1);
    
    try {
        auto body = nlohmann::json::parse(req.body);
        std::string text = body.at("text").get<std::string>();
        std::string type = body.value("type", "single_choice");
        int points = body.value("points", 1);
        
        Database& db = Database::get_instance();
        std::string q_id = db.add_question(test_id, text, type, points);
        
        if (q_id.empty()) {
            res.status = 500;
            res.set_content("{\"error\": \"Failed to add question\"}", "application/json");
            return;
        }

        // Add options if present
        if (body.contains("options") && body["options"].is_array()) {
            for (const auto& opt : body["options"]) {
                std::string opt_text = opt.at("text").get<std::string>();
                bool is_correct = opt.value("is_correct", false);
                db.add_option(q_id, opt_text, is_correct);
            }
        }
        
        res.status = 201;
        nlohmann::json response;
        response["status"] = "success";
        response["id"] = q_id;
        res.set_content(response.dump(), "application/json");
        
    } catch (const std::exception& e) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
    }
}

void GetTestDetailsHandler(const httplib::Request& req, httplib::Response& res) {
    // Auth check optional? Usually need to be logged in.
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    std::string test_id = matchToString(req.matches, 1);
    Database& db = Database::get_instance();
    Test test = db.get_test_details(test_id);
    
    if (test.id.empty()) {
        res.status = 404;
        res.set_content("{\"error\": \"Test not found\"}", "application/json");
        return;
    }
    
    nlohmann::json response;
    response["id"] = test.id;
    response["name"] = test.name;
    response["description"] = test.description;
    response["course_id"] = test.course_id;
    response["created_by"] = test.created_by;
    
    nlohmann::json questions = nlohmann::json::array();
    for (const auto& q : test.questions) {
        nlohmann::json q_json;
        q_json["id"] = q.id;
        q_json["text"] = q.text;
        q_json["type"] = q.type;
        q_json["points"] = q.points;
        
        nlohmann::json options = nlohmann::json::array();
        for (const auto& opt : q.options) {
            nlohmann::json opt_json;
            opt_json["id"] = opt.id;
            opt_json["text"] = opt.text;
            opt_json["is_correct"] = opt.is_correct; 
            options.push_back(opt_json);
        }
        q_json["options"] = options;
        questions.push_back(q_json);
    }
    response["questions"] = questions;
    
    res.set_content(response.dump(), "application/json");
}

void GetTestsHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    std::vector<Test> tests = db.get_all_tests();
    
    nlohmann::json response;
    nlohmann::json tests_arr = nlohmann::json::array();
    
    for (const auto& t : tests) {
        nlohmann::json t_json;
        t_json["id"] = t.id;
        t_json["name"] = t.name;
        t_json["description"] = t.description;
        t_json["course_id"] = t.course_id;
        t_json["created_by"] = t.created_by;
        tests_arr.push_back(t_json);
    }
    response["tests"] = tests_arr;
    
    res.set_content(response.dump(), "application/json");
}

// ============================================================================
// COURSES API
// ============================================================================

void GetCoursesListHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    PGresult* result = PQexec(conn, 
        "SELECT c.id::text, c.name, c.description, c.teacher_id::text, u.full_name as teacher_name "
        "FROM courses c "
        "LEFT JOIN users u ON c.teacher_id = u.id "
        "WHERE c.is_deleted = FALSE "
        "ORDER BY c.name");

    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }

    nlohmann::json json_response;
    nlohmann::json arr = nlohmann::json::array();
    int rows = PQntuples(result);
    for (int i = 0; i < rows; i++) {
        nlohmann::json item;
        item["id"] = PQgetvalue(result, i, 0);
        item["name"] = PQgetvalue(result, i, 1);
        item["description"] = PQgetvalue(result, i, 2) ? PQgetvalue(result, i, 2) : "";
        item["teacher_id"] = PQgetvalue(result, i, 3) ? PQgetvalue(result, i, 3) : "";
        item["teacher_name"] = PQgetvalue(result, i, 4) ? PQgetvalue(result, i, 4) : "";
        arr.push_back(item);
    }
    PQclear(result);
    json_response["courses"] = arr;
    res.set_content(json_response.dump(), "application/json");
}

void GetCourseInfoHandler(const httplib::Request& req, httplib::Response& res) {
    std::string courseId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = courseId.c_str();
    PGresult* result = PQexecParams(conn,
        "SELECT c.id::text, c.name, c.description, c.teacher_id::text, u.full_name as teacher_name "
        "FROM courses c "
        "LEFT JOIN users u ON c.teacher_id = u.id "
        "WHERE c.id = $1 AND c.is_deleted = FALSE",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK || PQntuples(result) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Course not found\"}", "application/json");
        PQclear(result);
        return;
    }

    nlohmann::json json_response;
    json_response["id"] = PQgetvalue(result, 0, 0);
    json_response["name"] = PQgetvalue(result, 0, 1);
    json_response["description"] = PQgetvalue(result, 0, 2) ? PQgetvalue(result, 0, 2) : "";
    json_response["teacher_id"] = PQgetvalue(result, 0, 3) ? PQgetvalue(result, 0, 3) : "";
    json_response["teacher_name"] = PQgetvalue(result, 0, 4) ? PQgetvalue(result, 0, 4) : "";
    PQclear(result);
    res.set_content(json_response.dump(), "application/json");
}

void CreateCourseHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "course:add", res)) return;

    std::string name, description, teacher_id;
    try {
        auto body = nlohmann::json::parse(req.body);
        name = body.at("name").get<std::string>();
        description = body.value("description", "");
        teacher_id = body.value("teacher_id", ctx.user_id);
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[3];
    paramValues[0] = name.c_str();
    paramValues[1] = description.c_str();
    paramValues[2] = teacher_id.c_str();
    PGresult* result = PQexecParams(conn,
        "INSERT INTO courses (name, description, teacher_id) VALUES ($1, $2, $3) RETURNING id::text",
        3, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Insert failed\"}", "application/json");
        PQclear(result);
        return;
    }

    nlohmann::json json_response;
    json_response["status"] = "success";
    json_response["id"] = PQgetvalue(result, 0, 0);
    PQclear(result);
    res.status = 201;
    res.set_content(json_response.dump(), "application/json");
}

void UpdateCourseHandler(const httplib::Request& req, httplib::Response& res) {
    std::string courseId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = courseId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT teacher_id::text FROM courses WHERE id = $1 AND is_deleted = FALSE",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Course not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    PQclear(checkResult);

    if (ctx.user_id != teacher_id) {
        if (!CheckAccess(ctx, "course:info:write", res)) return;
    }

    std::string name, description;
    try {
        auto body = nlohmann::json::parse(req.body);
        name = body.value("name", "");
        description = body.value("description", "");
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    std::string query = "UPDATE courses SET ";
    std::vector<std::string> updates;
    std::vector<const char*> paramValues;
    int paramIndex = 1;

    std::string nameParam, descParam;
    if (!name.empty()) {
        nameParam = name;
        updates.push_back("name = $" + std::to_string(paramIndex++));
        paramValues.push_back(nameParam.c_str());
    }
    if (!description.empty()) {
        descParam = description;
        updates.push_back("description = $" + std::to_string(paramIndex++));
        paramValues.push_back(descParam.c_str());
    }

    if (updates.empty()) {
        res.status = 400;
        res.set_content("{\"error\": \"Nothing to update\"}", "application/json");
        return;
    }

    for (size_t i = 0; i < updates.size(); i++) {
        query += updates[i];
        if (i < updates.size() - 1) query += ", ";
    }
    query += " WHERE id = $" + std::to_string(paramIndex);
    paramValues.push_back(courseId.c_str());

    PGresult* result = PQexecParams(conn, query.c_str(),
        static_cast<int>(paramValues.size()), nullptr, paramValues.data(), nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void DeleteCourseHandler(const httplib::Request& req, httplib::Response& res) {
    std::string courseId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = courseId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT teacher_id::text FROM courses WHERE id = $1 AND is_deleted = FALSE",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Course not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    PQclear(checkResult);

    if (ctx.user_id != teacher_id) {
        if (!CheckAccess(ctx, "course:del", res)) return;
    }

    const char* paramValues[1];
    paramValues[0] = courseId.c_str();
    PGresult* result = PQexecParams(conn,
        "UPDATE courses SET is_deleted = TRUE WHERE id = $1",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Delete failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void GetCourseStudentsHandler(const httplib::Request& req, httplib::Response& res) {
    std::string courseId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = courseId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT teacher_id::text FROM courses WHERE id = $1 AND is_deleted = FALSE",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Course not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    PQclear(checkResult);

    if (ctx.user_id != teacher_id) {
        if (!CheckAccess(ctx, "course:userList", res)) return;
    }

    const char* paramValues[1];
    paramValues[0] = courseId.c_str();
    PGresult* result = PQexecParams(conn,
        "SELECT u.id::text, u.full_name, u.email FROM users u "
        "JOIN user_courses uc ON u.id = uc.user_id "
        "WHERE uc.course_id = $1",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }

    nlohmann::json json_response;
    nlohmann::json arr = nlohmann::json::array();
    int rows = PQntuples(result);
    for (int i = 0; i < rows; i++) {
        nlohmann::json item;
        item["id"] = PQgetvalue(result, i, 0);
        item["name"] = PQgetvalue(result, i, 1) ? PQgetvalue(result, i, 1) : "";
        item["email"] = PQgetvalue(result, i, 2);
        arr.push_back(item);
    }
    PQclear(result);
    json_response["students"] = arr;
    res.set_content(json_response.dump(), "application/json");
}

void GetCourseTestsHandler(const httplib::Request& req, httplib::Response& res) {
    std::string courseId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[2];
    checkParams[0] = courseId.c_str();
    checkParams[1] = ctx.user_id.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT c.teacher_id::text, "
        "(SELECT COUNT(*) > 0 FROM user_courses uc WHERE uc.course_id = c.id AND uc.user_id = $2) as enrolled "
        "FROM courses c WHERE c.id = $1 AND c.is_deleted = FALSE",
        2, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Course not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    std::string enrolled = PQgetvalue(checkResult, 0, 1);
    PQclear(checkResult);

    bool isTeacher = (ctx.user_id == teacher_id);
    bool isEnrolled = (enrolled == "t" || enrolled == "true");

    if (!isTeacher && !isEnrolled) {
        if (!CheckAccess(ctx, "course:testList", res)) return;
    }

    const char* paramValues[1];
    paramValues[0] = courseId.c_str();
    PGresult* result = PQexecParams(conn,
        "SELECT id::text, name, is_active FROM tests WHERE course_id = $1",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }

    nlohmann::json json_response;
    nlohmann::json arr = nlohmann::json::array();
    int rows = PQntuples(result);
    for (int i = 0; i < rows; i++) {
        nlohmann::json item;
        item["id"] = PQgetvalue(result, i, 0);
        item["name"] = PQgetvalue(result, i, 1);
        std::string active = PQgetvalue(result, i, 2);
        item["is_active"] = (active == "t" || active == "true");
        arr.push_back(item);
    }
    PQclear(result);
    json_response["tests"] = arr;
    res.set_content(json_response.dump(), "application/json");
}

void EnrollUserHandler(const httplib::Request& req, httplib::Response& res) {
    std::string courseId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    std::string targetUserId = ctx.user_id;
    try {
        auto body = nlohmann::json::parse(req.body);
        targetUserId = body.value("user_id", ctx.user_id);
    } catch (...) {}

    if (targetUserId != ctx.user_id) {
        if (!CheckAccess(ctx, "course:user:add", res)) return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[2];
    paramValues[0] = targetUserId.c_str();
    paramValues[1] = courseId.c_str();
    PGresult* result = PQexecParams(conn,
        "INSERT INTO user_courses (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        2, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Enrollment failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void UnenrollUserHandler(const httplib::Request& req, httplib::Response& res) {
    std::string courseId = matchToString(req.matches, 1);
    std::string targetUserId = matchToString(req.matches, 2);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (targetUserId != ctx.user_id) {
        if (!CheckAccess(ctx, "course:user:del", res)) return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[2];
    paramValues[0] = targetUserId.c_str();
    paramValues[1] = courseId.c_str();
    PGresult* result = PQexecParams(conn,
        "DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2",
        2, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Unenrollment failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void ActivateTestHandler(const httplib::Request& req, httplib::Response& res) {
    std::string testId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    bool is_active = true;
    try {
        auto body = nlohmann::json::parse(req.body);
        is_active = body.at("is_active").get<bool>();
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = testId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT c.teacher_id::text FROM tests t "
        "JOIN courses c ON t.course_id = c.id "
        "WHERE t.id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Test not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    PQclear(checkResult);

    if (ctx.user_id != teacher_id) {
        if (!CheckAccess(ctx, "course:test:write", res)) return;
    }

    std::string activeStr = is_active ? "true" : "false";
    const char* paramValues[2];
    paramValues[0] = activeStr.c_str();
    paramValues[1] = testId.c_str();
    PGresult* result = PQexecParams(conn,
        "UPDATE tests SET is_active = $1 WHERE id = $2",
        2, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }

    if (!is_active) {
        const char* finishParams[1];
        finishParams[0] = testId.c_str();
        PGresult* finishResult = PQexecParams(conn,
            "UPDATE test_attempts SET status = 'completed', finished_at = NOW() "
            "WHERE test_id = $1 AND status = 'in_progress'",
            1, nullptr, finishParams, nullptr, nullptr, 0);
        PQclear(finishResult);
    }

    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

// ============================================================================
// QUESTIONS API
// ============================================================================

void GetQuestionsListHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = ctx.user_id.c_str();

    bool hasPermission = std::find(ctx.permissions.begin(), ctx.permissions.end(), "quest:list:read") != ctx.permissions.end();

    PGresult* result;
    if (hasPermission) {
        result = PQexec(conn,
            "SELECT q.id::text, q.text, q.question_type FROM questions q ORDER BY q.created_at DESC");
    } else {
        result = PQexecParams(conn,
            "SELECT DISTINCT q.id::text, q.text, q.question_type "
            "FROM questions q "
            "JOIN tests t ON q.test_id = t.id "
            "JOIN courses c ON t.course_id = c.id "
            "WHERE c.teacher_id = $1",
            1, nullptr, paramValues, nullptr, nullptr, 0);
    }

    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }

    nlohmann::json json_response;
    nlohmann::json arr = nlohmann::json::array();
    int rows = PQntuples(result);
    for (int i = 0; i < rows; i++) {
        nlohmann::json item;
        item["id"] = PQgetvalue(result, i, 0);
        item["text"] = PQgetvalue(result, i, 1);
        item["type"] = PQgetvalue(result, i, 2) ? PQgetvalue(result, i, 2) : "";
        arr.push_back(item);
    }
    PQclear(result);
    json_response["questions"] = arr;
    res.set_content(json_response.dump(), "application/json");
}

void GetQuestionHandler(const httplib::Request& req, httplib::Response& res) {
    std::string questionId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = questionId.c_str();
    PGresult* result = PQexecParams(conn,
        "SELECT q.id::text, q.text, q.question_type, q.points, q.test_id::text "
        "FROM questions q WHERE q.id = $1",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK || PQntuples(result) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Question not found\"}", "application/json");
        PQclear(result);
        return;
    }

    nlohmann::json json_response;
    json_response["id"] = PQgetvalue(result, 0, 0);
    json_response["text"] = PQgetvalue(result, 0, 1);
    json_response["type"] = PQgetvalue(result, 0, 2);
    json_response["points"] = std::stoi(PQgetvalue(result, 0, 3));
    json_response["test_id"] = PQgetvalue(result, 0, 4) ? PQgetvalue(result, 0, 4) : "";
    PQclear(result);

    paramValues[0] = questionId.c_str();
    PGresult* optResult = PQexecParams(conn,
        "SELECT id::text, text, is_correct FROM question_options WHERE question_id = $1 ORDER BY order_number",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    nlohmann::json options = nlohmann::json::array();
    if (PQresultStatus(optResult) == PGRES_TUPLES_OK) {
        int rows = PQntuples(optResult);
        for (int i = 0; i < rows; i++) {
            nlohmann::json opt;
            opt["id"] = PQgetvalue(optResult, i, 0);
            opt["text"] = PQgetvalue(optResult, i, 1);
            std::string correct = PQgetvalue(optResult, i, 2);
            opt["is_correct"] = (correct == "t" || correct == "true");
            options.push_back(opt);
        }
    }
    PQclear(optResult);
    json_response["options"] = options;

    res.set_content(json_response.dump(), "application/json");
}

void CreateQuestionHandler(const httplib::Request& req, httplib::Response& res) {
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    if (!CheckAccess(ctx, "quest:create", res)) return;

    std::string text, type;
    int points = 1;
    nlohmann::json options_json;

    try {
        auto body = nlohmann::json::parse(req.body);
        text = body.at("text").get<std::string>();
        type = body.value("type", "single_choice");
        points = body.value("points", 1);
        if (body.contains("options")) {
            options_json = body["options"];
        }
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    std::string pointsStr = std::to_string(points);
    const char* paramValues[3];
    paramValues[0] = text.c_str();
    paramValues[1] = type.c_str();
    paramValues[2] = pointsStr.c_str();

    PGresult* result = PQexecParams(conn,
        "INSERT INTO questions (text, question_type, points) VALUES ($1, $2, $3) RETURNING id::text",
        3, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Insert failed\"}", "application/json");
        PQclear(result);
        return;
    }

    std::string questionId = PQgetvalue(result, 0, 0);
    PQclear(result);

    if (options_json.is_array()) {
        int orderNum = 0;
        for (const auto& opt : options_json) {
            std::string optText = opt.at("text").get<std::string>();
            bool isCorrect = opt.value("is_correct", false);
            std::string correctStr = isCorrect ? "true" : "false";
            std::string orderStr = std::to_string(orderNum++);

            const char* optParams[4];
            optParams[0] = questionId.c_str();
            optParams[1] = optText.c_str();
            optParams[2] = correctStr.c_str();
            optParams[3] = orderStr.c_str();

            PGresult* optResult = PQexecParams(conn,
                "INSERT INTO question_options (question_id, text, is_correct, order_number) VALUES ($1, $2, $3, $4)",
                4, nullptr, optParams, nullptr, nullptr, 0);
            PQclear(optResult);
        }
    }

    nlohmann::json json_response;
    json_response["status"] = "success";
    json_response["id"] = questionId;
    res.status = 201;
    res.set_content(json_response.dump(), "application/json");
}

void UpdateQuestionHandler(const httplib::Request& req, httplib::Response& res) {
    std::string questionId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = questionId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT c.teacher_id::text FROM questions q "
        "JOIN tests t ON q.test_id = t.id "
        "JOIN courses c ON t.course_id = c.id "
        "WHERE q.id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    bool isOwner = false;
    if (PQresultStatus(checkResult) == PGRES_TUPLES_OK && PQntuples(checkResult) > 0) {
        std::string teacher_id = PQgetvalue(checkResult, 0, 0);
        isOwner = (ctx.user_id == teacher_id);
    }
    PQclear(checkResult);

    if (!isOwner) {
        if (!CheckAccess(ctx, "quest:update", res)) return;
    }

    std::string text;
    nlohmann::json options_json;
    try {
        auto body = nlohmann::json::parse(req.body);
        text = body.value("text", "");
        if (body.contains("options")) {
            options_json = body["options"];
        }
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    if (!text.empty()) {
        const char* updateParams[2];
        updateParams[0] = text.c_str();
        updateParams[1] = questionId.c_str();
        PGresult* updateResult = PQexecParams(conn,
            "UPDATE questions SET text = $1 WHERE id = $2",
            2, nullptr, updateParams, nullptr, nullptr, 0);
        PQclear(updateResult);
    }

    if (options_json.is_array()) {
        const char* delParams[1];
        delParams[0] = questionId.c_str();
        PGresult* delResult = PQexecParams(conn,
            "DELETE FROM question_options WHERE question_id = $1",
            1, nullptr, delParams, nullptr, nullptr, 0);
        PQclear(delResult);

        int orderNum = 0;
        for (const auto& opt : options_json) {
            std::string optText = opt.at("text").get<std::string>();
            bool isCorrect = opt.value("is_correct", false);
            std::string correctStr = isCorrect ? "true" : "false";
            std::string orderStr = std::to_string(orderNum++);

            const char* optParams[4];
            optParams[0] = questionId.c_str();
            optParams[1] = optText.c_str();
            optParams[2] = correctStr.c_str();
            optParams[3] = orderStr.c_str();

            PGresult* optResult = PQexecParams(conn,
                "INSERT INTO question_options (question_id, text, is_correct, order_number) VALUES ($1, $2, $3, $4)",
                4, nullptr, optParams, nullptr, nullptr, 0);
            PQclear(optResult);
        }
    }

    res.set_content("{\"status\": \"success\"}", "application/json");
}

void DeleteQuestionHandler(const httplib::Request& req, httplib::Response& res) {
    std::string questionId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = questionId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT c.teacher_id::text FROM questions q "
        "JOIN tests t ON q.test_id = t.id "
        "JOIN courses c ON t.course_id = c.id "
        "WHERE q.id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    bool isOwner = false;
    if (PQresultStatus(checkResult) == PGRES_TUPLES_OK && PQntuples(checkResult) > 0) {
        std::string teacher_id = PQgetvalue(checkResult, 0, 0);
        isOwner = (ctx.user_id == teacher_id);
    }
    PQclear(checkResult);

    if (!isOwner) {
        if (!CheckAccess(ctx, "quest:del", res)) return;
    }

    const char* paramValues[1];
    paramValues[0] = questionId.c_str();
    PGresult* result = PQexecParams(conn,
        "DELETE FROM questions WHERE id = $1",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Delete failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void AddQuestionToTestHandler(const httplib::Request& req, httplib::Response& res) {
    std::string testId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    std::string questionId;
    try {
        auto body = nlohmann::json::parse(req.body);
        questionId = body.at("question_id").get<std::string>();
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = testId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT c.teacher_id::text FROM tests t "
        "JOIN courses c ON t.course_id = c.id WHERE t.id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Test not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    PQclear(checkResult);

    if (ctx.user_id != teacher_id) {
        if (!CheckAccess(ctx, "test:quest:add", res)) return;
    }

    const char* paramValues[2];
    paramValues[0] = testId.c_str();
    paramValues[1] = questionId.c_str();
    PGresult* result = PQexecParams(conn,
        "UPDATE questions SET test_id = $1 WHERE id = $2",
        2, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void RemoveQuestionFromTestHandler(const httplib::Request& req, httplib::Response& res) {
    std::string testId = matchToString(req.matches, 1);
    std::string questionId = matchToString(req.matches, 2);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = testId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT c.teacher_id::text FROM tests t "
        "JOIN courses c ON t.course_id = c.id WHERE t.id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Test not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    PQclear(checkResult);

    if (ctx.user_id != teacher_id) {
        if (!CheckAccess(ctx, "test:quest:del", res)) return;
    }

    const char* paramValues[2];
    paramValues[0] = testId.c_str();
    paramValues[1] = questionId.c_str();
    PGresult* result = PQexecParams(conn,
        "UPDATE questions SET test_id = NULL WHERE test_id = $1 AND id = $2",
        2, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

// ============================================================================
// ATTEMPTS API
// ============================================================================

void GetAttemptHandler(const httplib::Request& req, httplib::Response& res) {
    std::string attemptId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = attemptId.c_str();
    PGresult* result = PQexecParams(conn,
        "SELECT ta.id::text, ta.test_id::text, ta.user_id::text, ta.status, ta.score, ta.max_score, "
        "c.teacher_id::text "
        "FROM test_attempts ta "
        "JOIN tests t ON ta.test_id = t.id "
        "JOIN courses c ON t.course_id = c.id "
        "WHERE ta.id = $1",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK || PQntuples(result) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Attempt not found\"}", "application/json");
        PQclear(result);
        return;
    }

    std::string attemptUserId = PQgetvalue(result, 0, 2);
    std::string teacherId = PQgetvalue(result, 0, 6);

    if (ctx.user_id != attemptUserId && ctx.user_id != teacherId) {
        if (!CheckAccess(ctx, "test:answer:read", res)) {
            PQclear(result);
            return;
        }
    }

    nlohmann::json json_response;
    json_response["id"] = PQgetvalue(result, 0, 0);
    json_response["test_id"] = PQgetvalue(result, 0, 1);
    json_response["user_id"] = PQgetvalue(result, 0, 2);
    json_response["status"] = PQgetvalue(result, 0, 3);
    json_response["score"] = PQgetvalue(result, 0, 4) ? std::stoi(PQgetvalue(result, 0, 4)) : 0;
    json_response["max_score"] = PQgetvalue(result, 0, 5) ? std::stoi(PQgetvalue(result, 0, 5)) : 0;
    PQclear(result);

    paramValues[0] = attemptId.c_str();
    PGresult* answersResult = PQexecParams(conn,
        "SELECT aa.id::text, aa.question_id::text, aa.option_id::text, aa.is_correct "
        "FROM attempt_answers aa WHERE aa.attempt_id = $1",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    nlohmann::json answers = nlohmann::json::array();
    if (PQresultStatus(answersResult) == PGRES_TUPLES_OK) {
        int rows = PQntuples(answersResult);
        for (int i = 0; i < rows; i++) {
            nlohmann::json ans;
            ans["id"] = PQgetvalue(answersResult, i, 0);
            ans["question_id"] = PQgetvalue(answersResult, i, 1);
            ans["option_id"] = PQgetvalue(answersResult, i, 2) ? PQgetvalue(answersResult, i, 2) : "";
            std::string correct = PQgetvalue(answersResult, i, 3) ? PQgetvalue(answersResult, i, 3) : "";
            ans["is_correct"] = (correct == "t" || correct == "true");
            answers.push_back(ans);
        }
    }
    PQclear(answersResult);
    json_response["answers"] = answers;

    res.set_content(json_response.dump(), "application/json");
}

void FinishAttemptHandler(const httplib::Request& req, httplib::Response& res) {
    std::string attemptId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = attemptId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT user_id::text, status FROM test_attempts WHERE id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Attempt not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string attemptUserId = PQgetvalue(checkResult, 0, 0);
    std::string status = PQgetvalue(checkResult, 0, 1);
    PQclear(checkResult);

    if (ctx.user_id != attemptUserId) {
        res.status = 403;
        res.set_content("{\"error\": \"Forbidden\"}", "application/json");
        return;
    }

    if (status == "completed") {
        res.status = 400;
        res.set_content("{\"error\": \"Attempt already completed\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = attemptId.c_str();
    PGresult* result = PQexecParams(conn,
        "UPDATE test_attempts SET status = 'completed', finished_at = NOW() WHERE id = $1",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void UpdateAnswerHandler(const httplib::Request& req, httplib::Response& res) {
    std::string attemptId = matchToString(req.matches, 1);
    std::string answerId = matchToString(req.matches, 2);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    std::string optionId;
    try {
        auto body = nlohmann::json::parse(req.body);
        optionId = body.at("option_id").get<std::string>();
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const char* checkParams[1];
    checkParams[0] = attemptId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT user_id::text, status FROM test_attempts WHERE id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        res.status = 404;
        res.set_content("{\"error\": \"Attempt not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string attemptUserId = PQgetvalue(checkResult, 0, 0);
    std::string status = PQgetvalue(checkResult, 0, 1);
    PQclear(checkResult);

    if (ctx.user_id != attemptUserId) {
        res.status = 403;
        res.set_content("{\"error\": \"Forbidden\"}", "application/json");
        return;
    }

    if (status == "completed") {
        res.status = 400;
        res.set_content("{\"error\": \"Attempt already completed\"}", "application/json");
        return;
    }

    const char* paramValues[2];
    paramValues[0] = optionId.c_str();
    paramValues[1] = answerId.c_str();
    PGresult* result = PQexecParams(conn,
        "UPDATE attempt_answers SET option_id = $1 WHERE id = $2",
        2, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

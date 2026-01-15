#include "handlerRequest.h"
#include "postgres.h"
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
#include <cctype>
#include <libpq-fe.h>
#include <nlohmann/json.hpp>

static bool IsUuid(const std::string& s) {
    // Strict UUID check: 8-4-4-4-12 hex digits
    if (s.size() != 36) return false;
    const int dash_pos[] = {8, 13, 18, 23};
    for (int i = 0; i < 4; i++) {
        if (s[dash_pos[i]] != '-') return false;
    }
    for (size_t i = 0; i < s.size(); i++) {
        if (s[i] == '-') continue;
        if (!std::isxdigit(static_cast<unsigned char>(s[i]))) return false;
    }
    return true;
}

static std::string ResolveOrCreateUserUUID(PGconn* conn, const std::string& authSub, const std::string& email) {
    if (!conn) return "";
    if (IsUuid(authSub)) return authSub;

    // 1) Try resolve by external_id
    {
        const char* params[1];
        params[0] = authSub.c_str();
        PGresult* r = PQexecParams(
            conn,
            "SELECT id::text FROM users WHERE external_id = $1",
            1, nullptr, params, nullptr, nullptr, 0);
        if (PQresultStatus(r) == PGRES_TUPLES_OK && PQntuples(r) > 0) {
            std::string id = PQgetvalue(r, 0, 0);
            PQclear(r);
            return id;
        }
        PQclear(r);
    }

    // 2) Upsert by email and bind external_id
    if (!email.empty()) {
        const char* params[2];
        params[0] = email.c_str();
        params[1] = authSub.c_str();
        PGresult* r = PQexecParams(
            conn,
            "INSERT INTO users (email, external_id) VALUES ($1, $2) "
            "ON CONFLICT (email) DO UPDATE SET external_id = EXCLUDED.external_id "
            "RETURNING id::text",
            2, nullptr, params, nullptr, nullptr, 0);
        if (PQresultStatus(r) == PGRES_TUPLES_OK && PQntuples(r) > 0) {
            std::string id = PQgetvalue(r, 0, 0);
            PQclear(r);
            return id;
        }
        PQclear(r);
    }

    return "";
}

// ============================================================================
// ЗАГЛУШКИ ДЛЯ ФУНКЦИЙ
// ============================================================================

static bool IsBlockedUser(const AuthContext& ctx) {
    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        return false;
    }

    const std::string user_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
    if (user_uuid.empty()) {
        return false;
    }

    const char* paramValues[1];
    paramValues[0] = user_uuid.c_str();
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
    if (ctx.user_id == uid) return true;

    // If route uses UUID but token sub is external_id, map by external_id
    if (IsUuid(uid) && !IsUuid(ctx.user_id)) {
        Database& db = Database::get_instance();
        PGconn* conn = db.getConnection();
        if (!conn) return false;

        const char* params[2];
        params[0] = uid.c_str();
        params[1] = ctx.user_id.c_str();
        PGresult* r = PQexecParams(
            conn,
            "SELECT 1 FROM users WHERE id = $1 AND external_id = $2",
            2, nullptr, params, nullptr, nullptr, 0);
        const bool ok = (PQresultStatus(r) == PGRES_TUPLES_OK && PQntuples(r) > 0);
        PQclear(r);
        return ok;
    }

    return false;
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
    
    // Реальная логика добавления пользователя
    try {
        auto body = nlohmann::json::parse(req.body);
        
        std::string userId = body.value("user_id", "");
        std::string email = body.value("email", "");
        std::string fullName = body.value("full_name", "");
        std::string roles = body.value("roles", "[]");
        
        std::cout << "[AddUserHandler] Adding user: " << userId << " " << email << std::endl;
        
        Database& db = Database::get_instance();
        PGconn* conn = db.getConnection();
        
        if (!conn) {
            res.status = 500;
            res.set_content("{\"error\": \"Database not connected\"}", "application/json");
            return;
        }
        
        // Проверяем, существует ли пользователь
        const char* checkParams[1];
        checkParams[0] = userId.c_str();
        PGresult* checkResult = PQexecParams(conn,
            "SELECT id FROM users WHERE id::text = $1",
            1, nullptr, checkParams, nullptr, nullptr, 0);
        
        bool userExists = (PQresultStatus(checkResult) == PGRES_TUPLES_OK && PQntuples(checkResult) > 0);
        PQclear(checkResult);
        
        if (userExists) {
            // Пользователь уже существует, обновляем данные
            const char* updateParams[4];
            updateParams[0] = email.c_str();
            updateParams[1] = fullName.c_str();
            updateParams[2] = roles.c_str();
            updateParams[3] = userId.c_str();
            
            PGresult* updateResult = PQexecParams(conn,
                "UPDATE users SET email = $1, full_name = $2, roles = $3 WHERE id::text = $4",
                4, nullptr, updateParams, nullptr, nullptr, 0);
            
            if (PQresultStatus(updateResult) != PGRES_COMMAND_OK) {
                PQclear(updateResult);
                res.status = 500;
                res.set_content("{\"error\": \"Failed to update user\"}", "application/json");
                return;
            }
            PQclear(updateResult);
            
            std::cout << "[AddUserHandler] User updated: " << userId << std::endl;
        } else {
            // Создаем нового пользователя
            const char* insertParams[4];
            insertParams[0] = userId.c_str();
            insertParams[1] = email.c_str();
            insertParams[2] = fullName.c_str();
            insertParams[3] = roles.c_str();
            
            PGresult* insertResult = PQexecParams(conn,
                "INSERT INTO users (id, email, full_name, roles, created_at) VALUES ($1, $2, $3, $4, NOW())",
                4, nullptr, insertParams, nullptr, nullptr, 0);
            
            if (PQresultStatus(insertResult) != PGRES_COMMAND_OK) {
                PQclear(insertResult);
                res.status = 500;
                res.set_content("{\"error\": \"Failed to create user\"}", "application/json");
                return;
            }
            PQclear(insertResult);
            
            std::cout << "[AddUserHandler] User created: " << userId << std::endl;
        }
        
        nlohmann::json response;
        response["status"] = "success";
        response["message"] = userExists ? "User updated" : "User created";
        response["user_id"] = userId;
        
        res.set_content(response.dump(), "application/json");
    } catch (const nlohmann::json::exception& ex) {
        std::cout << "[AddUserHandler] JSON Error: " << ex.what() << std::endl;
        res.status = 400;
        res.set_content("{\"error\": \"Invalid JSON\"}", "application/json");
    } catch (const std::exception& ex) {
        std::cout << "[AddUserHandler] Error: " << ex.what() << std::endl;
        res.status = 500;
        res.set_content("{\"error\": \"Internal server error\"}", "application/json");
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
    std::string query = "SELECT id::text, email, full_name, roles FROM users ORDER BY created_at";
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
        user["roles"] = PQgetvalue(result, i, 3) ? PQgetvalue(result, i, 3) : "[]";
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
    std::cout << "[GetUserNameHandler] Auth context - authorized: " << ctx.authorized 
              << ", user_id: " << ctx.user_id << ", email: " << ctx.email << std::endl;
    
    if (Unauthorized(res, ctx)) return;

    // По умолчанию разрешаем смотреть ФИО (по task_flow), но оставляем блокировку
    
    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    const bool isSelf = IsThisUser(ctx, userId, res);
    const std::string user_uuid = ResolveOrCreateUserUUID(conn, userId, isSelf ? ctx.email : "");
    if (user_uuid.empty()) {
        res.status = 404;
        res.set_content("{\"error\": \"User not found\"}", "application/json");
        return;
    }
    
    // Получаем имя пользователя из БД
    const char* paramValues[1];
    paramValues[0] = user_uuid.c_str();
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
    // userId in routes can be UUID or external_id (Mongo). Resolve to UUID for joins.
    const std::string resolvedUserId = ResolveOrCreateUserUUID(conn, userId, IsThisUser(ctx, userId, res) ? ctx.email : "");
    if (resolvedUserId.empty()) {
        res.status = 404;
        res.set_content("{\"error\": \"User not found\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = resolvedUserId.c_str();
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
    std::cout << "[GetUserTestsHandler] Auth: " << ctx.authorized << std::endl;
    if (Unauthorized(res, ctx)) {
        std::cout << "[GetUserTestsHandler] Unauthorized" << std::endl;
        return;
    }

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

    const bool isSelf = IsThisUser(ctx, userId, res);
    const std::string user_uuid = ResolveOrCreateUserUUID(conn, userId, isSelf ? ctx.email : "");
    std::cout << "[GetUserTestsHandler] Resolved UUID: " << user_uuid << " for userId: " << userId << std::endl;
    
    if (user_uuid.empty()) {
        res.status = 404;
        res.set_content("{\"error\": \"User not found\"}", "application/json");
        return;
    }
    
    // Получаем тесты пользователя (попытки прохождения тестов)
    const char* paramValues[1];
    paramValues[0] = user_uuid.c_str();
    PGresult* result = PQexecParams(
        conn,
        "SELECT ta.test_id::text, t.name, ta.id::text as attempt_id, ta.score, ta.max_score, ta.status, ta.finished_at "
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
        std::cerr << "[GetUserTestsHandler] Query failed: " << PQerrorMessage(conn) << std::endl;
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        PQclear(result);
        return;
    }
    
    int rows = PQntuples(result);
    std::cout << "[GetUserTestsHandler] Found " << rows << " test attempts for user " << user_uuid << std::endl;
    
    nlohmann::json json_response;
    nlohmann::json tests_array = nlohmann::json::array();
    
    for (int i = 0; i < rows; i++) {
        nlohmann::json test;
        test["id"] = PQgetvalue(result, i, 0);  // test_id
        test["name"] = PQgetvalue(result, i, 1);
        test["attempt_id"] = PQgetvalue(result, i, 2);  // attempt_id
        
        // Safe conversion for score - check for NULL and empty string
        const char* score_str = PQgetvalue(result, i, 3);
        test["score"] = (score_str && score_str[0] != '\0') ? std::stoi(score_str) : 0;
        
        const char* max_score_str = PQgetvalue(result, i, 4);
        test["max_score"] = (max_score_str && max_score_str[0] != '\0') ? std::stoi(max_score_str) : 0;
        
        const char* status_str = PQgetvalue(result, i, 5);
        test["completed"] = (status_str && std::string(status_str) == "completed");
        
        const char* date_str = PQgetvalue(result, i, 6);
        test["date"] = (date_str && date_str[0] != '\0') ? date_str : "";
        tests_array.push_back(test);
    }
    
    json_response["tests"] = tests_array;
    PQclear(result);
    
    std::cout << "[GetUserTestsHandler] Response: " << json_response.dump() << std::endl;
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

    const std::string user_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
    if (user_uuid.empty()) {
        res.status = 500;
        res.set_content("{\"error\": \"Query failed\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = user_uuid.c_str();
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

    const std::string user_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
    if (user_uuid.empty()) {
        res.status = 500;
        res.set_content("{\"error\": \"Delete failed\"}", "application/json");
        return;
    }

    const char* paramValues[1];
    paramValues[0] = user_uuid.c_str();
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
        // user_id from client can be Mongo external id (or even missing/empty). Use JWT user.
        std::string user_id = ctx.user_id;

        // 3) Получаем экземпляр БД и создаем попытку теста
        Database& db = Database::get_instance();
        PGconn* conn = db.getConnection();
        if (!conn) {
            res.status = 500;
            res.set_content("{\"error\": \"Database not connected\"}", "application/json");
            return;
        }

        if (!IsUuid(user_id)) {
            user_id = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
        }
        if (user_id.empty()) {
            res.status = 500;
            res.set_content("{\"error\": \"User mapping failed\"}", "application/json");
            return;
        }

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

        // 5) Подсчитываем баллы если есть ответы
        int correct_count = 0;
        int max_score = 0;
        
        if (!answers.empty()) {
            // Подсчитываем правильные ответы
            for (const auto& answer : answers) {
                // Проверяем правильность варианта ответа
                const char* checkParams[1];
                checkParams[0] = answer.option_id.c_str();
                PGresult* checkResult = PQexecParams(conn,
                    "SELECT is_correct FROM question_options WHERE id = $1",
                    1, nullptr, checkParams, nullptr, nullptr, 0);
                
                if (PQresultStatus(checkResult) == PGRES_TUPLES_OK && PQntuples(checkResult) > 0) {
                    std::string correct = PQgetvalue(checkResult, 0, 0);
                    if (correct == "t" || correct == "true") {
                        correct_count++;
                    }
                    max_score++;
                }
                PQclear(checkResult);
            }
            
            // Обновляем баллы в попытке
            if (!db.finish_test_attempt(attempt_id, correct_count, max_score)) {
                std::cerr << "[CreateTestAttemptHandler] Warning: Failed to update attempt scores" << std::endl;
            }
        }

        std::cout << "[CreateTestAttemptHandler] Created attempt: " << attempt_id
                  << " with " << answers.size() << " answers, score: " << correct_count << "/" << max_score << std::endl;

        // 7) Формируем JSON-ответ
        nlohmann::json resp;
        resp["status"] = "success";
        resp["message"] = "Test attempt created successfully";
        resp["attempt_id"] = attempt_id;
        resp["test_id"] = test_id;
        resp["user_id"] = user_id;
        resp["answers_count"] = answers.size();
        resp["score"] = correct_count;
        resp["max_score"] = max_score;

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

        Database& db = Database::get_instance();
        PGconn* conn = db.getConnection();
        if (!conn) {
            res.status = 500;
            res.set_content("{\"error\": \"Database not connected\"}", "application/json");
            return;
        }

        std::string created_by = ctx.user_id;
        if (!IsUuid(created_by)) {
            created_by = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
        }
        if (created_by.empty()) {
            res.status = 500;
            res.set_content("{\"error\": \"User mapping failed\"}", "application/json");
            return;
        }

        const char* paramValues[4];
        paramValues[0] = name.c_str();
        paramValues[1] = desc.c_str();
        paramValues[2] = course_id.c_str();
        paramValues[3] = created_by.c_str();
        PGresult* result = PQexecParams(conn,
            "INSERT INTO tests (name, description, course_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id::text",
            4, nullptr, paramValues, nullptr, nullptr, 0);

        if (PQresultStatus(result) != PGRES_TUPLES_OK || PQntuples(result) == 0) {
            res.status = 500;
            res.set_content("{\"error\": \"Failed to create test\"}", "application/json");
            PQclear(result);
            return;
        }

        std::string id = PQgetvalue(result, 0, 0);
        PQclear(result);
        
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
        PGconn* conn = db.getConnection();
        if (!conn) {
            res.status = 500;
            res.set_content("{\"error\": \"Database not connected\"}", "application/json");
            return;
        }

        std::string ctx_uuid = ctx.user_id;
        if (!IsUuid(ctx_uuid)) {
            ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
        }
        if (ctx_uuid.empty()) {
            res.status = 500;
            res.set_content("{\"error\": \"User mapping failed\"}", "application/json");
            return;
        }

        // Ensure the test exists and the user can modify it (teacher of the course)
        {
            const char* checkParams[2];
            checkParams[0] = test_id.c_str();
            checkParams[1] = ctx_uuid.c_str();
            PGresult* checkResult = PQexecParams(conn,
                "SELECT c.teacher_id::text FROM tests t JOIN courses c ON t.course_id = c.id WHERE t.id = $1",
                1, nullptr, checkParams, nullptr, nullptr, 0);

            if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
                res.status = 404;
                res.set_content("{\"error\": \"Test not found\"}", "application/json");
                PQclear(checkResult);
                return;
            }

            std::string teacher_id = PQgetvalue(checkResult, 0, 0);
            PQclear(checkResult);

            if (teacher_id != ctx_uuid) {
                if (!CheckAccess(ctx, "course:test:write", res)) return;
            }
        }

        const char* qParams[4];
        std::string pointsStr = std::to_string(points);
        qParams[0] = test_id.c_str();
        qParams[1] = text.c_str();
        qParams[2] = type.c_str();
        qParams[3] = pointsStr.c_str();
        PGresult* qResult = PQexecParams(conn,
            "INSERT INTO questions (test_id, text, question_type, points) VALUES ($1, $2, $3, $4::int) RETURNING id::text",
            4, nullptr, qParams, nullptr, nullptr, 0);

        if (PQresultStatus(qResult) != PGRES_TUPLES_OK || PQntuples(qResult) == 0) {
            res.status = 500;
            res.set_content("{\"error\": \"Failed to add question\"}", "application/json");
            PQclear(qResult);
            return;
        }

        std::string q_id = PQgetvalue(qResult, 0, 0);
        PQclear(qResult);
        
        if (q_id.empty()) {
            res.status = 500;
            res.set_content("{\"error\": \"Failed to add question\"}", "application/json");
            return;
        }

        // Add options if present
        if (body.contains("options") && body["options"].is_array()) {
            int order_number = 1;
            for (const auto& opt : body["options"]) {
                std::string opt_text = opt.at("text").get<std::string>();
                bool is_correct = opt.value("is_correct", false);

                const char* optParams[4];
                std::string isCorrectStr = is_correct ? "true" : "false";
                std::string orderStr = std::to_string(order_number++);
                optParams[0] = q_id.c_str();
                optParams[1] = opt_text.c_str();
                optParams[2] = isCorrectStr.c_str();
                optParams[3] = orderStr.c_str();
                PGresult* optResult = PQexecParams(conn,
                    "INSERT INTO question_options (question_id, text, is_correct, order_number) VALUES ($1, $2, $3::boolean, $4::int)",
                    4, nullptr, optParams, nullptr, nullptr, 0);
                PQclear(optResult);
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

void UpdateTestHandler(const httplib::Request& req, httplib::Response& res) {
    std::string testId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    // Resolve user UUID
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
    }

    // Check test exists and user has permission
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

    if (ctx_uuid != teacher_id) {
        if (!CheckAccess(ctx, "course:test:write", res)) return;
    }

    std::string name, description;
    try {
        auto body = nlohmann::json::parse(req.body);
        name = body.value("name", "");
        description = body.value("description", "");
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request body\"}", "application/json");
        return;
    }

    // Build update query dynamically
    std::string query = "UPDATE tests SET ";
    std::vector<std::string> updates;
    std::vector<const char*> paramValues;
    int paramCount = 0;

    if (!name.empty()) {
        paramCount++;
        updates.push_back("name = $" + std::to_string(paramCount));
        paramValues.push_back(name.c_str());
    }
    if (!description.empty()) {
        paramCount++;
        updates.push_back("description = $" + std::to_string(paramCount));
        paramValues.push_back(description.c_str());
    }

    if (updates.empty()) {
        res.set_content("{\"status\": \"success\", \"message\": \"Nothing to update\"}", "application/json");
        return;
    }

    for (size_t i = 0; i < updates.size(); i++) {
        if (i > 0) query += ", ";
        query += updates[i];
    }
    paramCount++;
    query += " WHERE id = $" + std::to_string(paramCount);
    paramValues.push_back(testId.c_str());

    PGresult* result = PQexecParams(conn, query.c_str(),
        paramValues.size(), nullptr, paramValues.data(), nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }
    PQclear(result);
    res.set_content("{\"status\": \"success\"}", "application/json");
}

void DeleteTestHandler(const httplib::Request& req, httplib::Response& res) {
    std::string testId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    // Resolve user UUID
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
    }

    // Check test exists and user has permission
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

    if (ctx_uuid != teacher_id) {
        if (!CheckAccess(ctx, "course:test:del", res)) return;
    }

    // Delete test (cascade will handle questions and attempts)
    const char* paramValues[1];
    paramValues[0] = testId.c_str();
    PGresult* result = PQexecParams(conn,
        "DELETE FROM tests WHERE id = $1",
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
        "SELECT c.id::text, c.name, c.description, c.teacher_id::text, u.full_name as teacher_name, COALESCE(u.external_id, '') as teacher_external_id, "
        "(SELECT COUNT(*) FROM tests t WHERE t.course_id = c.id) as tests_count, "
        "(SELECT COUNT(*) FROM user_courses uc WHERE uc.course_id = c.id) as students_count "
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
        item["teacher_external_id"] = PQgetvalue(result, i, 5) ? PQgetvalue(result, i, 5) : "";
        item["tests_count"] = PQgetvalue(result, i, 6) ? std::stoi(PQgetvalue(result, i, 6)) : 0;
        item["students_count"] = PQgetvalue(result, i, 7) ? std::stoi(PQgetvalue(result, i, 7)) : 0;
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
        "SELECT c.id::text, c.name, c.description, c.teacher_id::text, u.full_name as teacher_name, COALESCE(u.external_id, '') as teacher_external_id, "
        "(SELECT COUNT(*) FROM tests t WHERE t.course_id = c.id) as tests_count, "
        "(SELECT COUNT(*) FROM user_courses uc WHERE uc.course_id = c.id) as students_count "
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
    json_response["teacher_external_id"] = PQgetvalue(result, 0, 5) ? PQgetvalue(result, 0, 5) : "";
    json_response["tests_count"] = PQgetvalue(result, 0, 6) ? std::stoi(PQgetvalue(result, 0, 6)) : 0;
    json_response["students_count"] = PQgetvalue(result, 0, 7) ? std::stoi(PQgetvalue(result, 0, 7)) : 0;
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

    // teacher_id must be UUID in DB. Resolve external id to UUID using email (only for self).
    if (!IsUuid(teacher_id)) {
        if (teacher_id != ctx.user_id) {
            res.status = 400;
            res.set_content("{\"error\": \"Invalid teacher_id\"}", "application/json");
            return;
        }
        teacher_id = ResolveOrCreateUserUUID(conn, teacher_id, ctx.email);
    }

    if (teacher_id.empty()) {
        res.status = 500;
        res.set_content("{\"error\": \"User mapping failed\"}", "application/json");
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

    std::string course_id = PQgetvalue(result, 0, 0);
    PQclear(result);

    // Auto-enroll creator/teacher into the course
    {
        const char* enrollParams[2];
        enrollParams[0] = teacher_id.c_str();
        enrollParams[1] = course_id.c_str();
        PGresult* enrollResult = PQexecParams(conn,
            "INSERT INTO user_courses (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            2, nullptr, enrollParams, nullptr, nullptr, 0);
        PQclear(enrollResult);
    }

    nlohmann::json json_response;
    json_response["status"] = "success";
    json_response["id"] = course_id;
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

    // Compare resolved UUIDs (ctx.user_id may be external_id)
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
    }

    if (ctx_uuid.empty() || ctx_uuid != teacher_id) {
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

    // Resolve user UUID
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
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

    if (ctx_uuid != teacher_id) {
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

    // Resolve user UUID
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
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

    if (ctx_uuid != teacher_id) {
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

    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
    }
    if (ctx_uuid.empty()) {
        res.status = 500;
        res.set_content("{\"error\": \"User mapping failed\"}", "application/json");
        return;
    }

    const char* checkParams[2];
    checkParams[0] = courseId.c_str();
    checkParams[1] = ctx_uuid.c_str();
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

    bool isTeacher = (ctx_uuid == teacher_id);
    bool isEnrolled = (enrolled == "t" || enrolled == "true");

    if (!isTeacher && !isEnrolled) {
        if (!CheckAccess(ctx, "course:testList", res)) return;
    }

    const char* paramValues[1];
    paramValues[0] = courseId.c_str();
    PGresult* result = PQexecParams(conn,
        "SELECT t.id::text, t.name, t.is_active, "
        "(SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) as questions_count "
        "FROM tests t WHERE t.course_id = $1",
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
        item["questions_count"] = PQgetisnull(result, i, 3) ? 0 : std::stoi(PQgetvalue(result, i, 3));
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

    // Resolve external id to UUID
    const bool isSelf = (targetUserId == ctx.user_id);
    std::string target_uuid = targetUserId;
    if (!IsUuid(target_uuid)) {
        target_uuid = ResolveOrCreateUserUUID(conn, targetUserId, isSelf ? ctx.email : "");
    }
    if (target_uuid.empty()) {
        res.status = 404;
        res.set_content("{\"error\": \"User not found\"}", "application/json");
        return;
    }

    const char* paramValues[2];
    paramValues[0] = target_uuid.c_str();
    paramValues[1] = courseId.c_str();
    PGresult* result = PQexecParams(conn,
        "INSERT INTO user_courses (user_id, course_id) VALUES ($1, $2) "
        "ON CONFLICT (user_id, course_id) DO NOTHING RETURNING 1",
        2, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        res.status = 500;
        res.set_content("{\"error\": \"Enrollment failed\"}", "application/json");
        PQclear(result);
        return;
    }

    if (PQntuples(result) == 0) {
        res.status = 409;
        res.set_content("{\"error\": \"User already enrolled\"}", "application/json");
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

    // Resolve user UUID
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
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

    if (ctx_uuid != teacher_id) {
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

    // Return all questions - both free (test_id IS NULL) and assigned
    // Include test_id so frontend can filter
    PGresult* result = PQexec(conn,
        "SELECT q.id::text, q.title, q.text, q.question_type, q.test_id::text, q.points, "
        "(SELECT COUNT(*) FROM question_options WHERE question_id = q.id) as options_count "
        "FROM questions q ORDER BY q.created_at DESC");

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
        item["title"] = PQgetvalue(result, i, 1);
        item["text"] = PQgetvalue(result, i, 2);
        item["type"] = PQgetisnull(result, i, 3) ? "single_choice" : PQgetvalue(result, i, 3);
        
        if (PQgetisnull(result, i, 4)) {
            item["test_id"] = nullptr;
        } else {
            item["test_id"] = PQgetvalue(result, i, 4);
        }
        
        item["points"] = PQgetisnull(result, i, 5) ? 1 : std::stoi(PQgetvalue(result, i, 5));
        item["options_count"] = PQgetisnull(result, i, 6) ? 0 : std::stoi(PQgetvalue(result, i, 6));
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
        "SELECT q.id::text, q.title, q.text, q.question_type, q.points, q.test_id::text "
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
    json_response["title"] = PQgetvalue(result, 0, 1);
    json_response["text"] = PQgetvalue(result, 0, 2);
    json_response["type"] = PQgetvalue(result, 0, 3);
    json_response["points"] = std::stoi(PQgetvalue(result, 0, 4));
    json_response["test_id"] = PQgetvalue(result, 0, 5) ? PQgetvalue(result, 0, 5) : "";
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

    std::string title, text, type;
    int points = 1;
    nlohmann::json options_json;

    try {
        auto body = nlohmann::json::parse(req.body);
        title = body.value("title", "");
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
    const char* paramValues[4];
    paramValues[0] = title.c_str();
    paramValues[1] = text.c_str();
    paramValues[2] = type.c_str();
    paramValues[3] = pointsStr.c_str();

    PGresult* result = PQexecParams(conn,
        "INSERT INTO questions (title, text, question_type, points) VALUES ($1, $2, $3, $4) RETURNING id::text",
        4, nullptr, paramValues, nullptr, nullptr, 0);

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

    std::string title, text;
    nlohmann::json options_json;
    try {
        auto body = nlohmann::json::parse(req.body);
        title = body.value("title", "");
        text = body.value("text", "");
        if (body.contains("options")) {
            options_json = body["options"];
        }
    } catch (...) {
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request\"}", "application/json");
        return;
    }

    if (!text.empty() || !title.empty()) {
        const char* updateParams[3];
        updateParams[0] = title.c_str();
        updateParams[1] = text.c_str();
        updateParams[2] = questionId.c_str();
        PGresult* updateResult = PQexecParams(conn,
            "UPDATE questions SET title = $1, text = $2 WHERE id = $3",
            3, nullptr, updateParams, nullptr, nullptr, 0);
        PQclear(updateResult);
    }

    if (options_json.is_array()) {
        // Get existing options
        std::vector<std::string> existingOptionIds;
        const char* paramValues[1];
        paramValues[0] = questionId.c_str();
        PGresult* existingResult = PQexecParams(conn,
            "SELECT id::text FROM question_options WHERE question_id = $1 ORDER BY order_number",
            1, nullptr, paramValues, nullptr, nullptr, 0);
        
        if (PQresultStatus(existingResult) == PGRES_TUPLES_OK) {
            int existingCount = PQntuples(existingResult);
            for (int i = 0; i < existingCount; i++) {
                existingOptionIds.push_back(PQgetvalue(existingResult, i, 0));
            }
        }
        PQclear(existingResult);

        // Update or insert options
        int orderNum = 0;
        for (const auto& opt : options_json) {
            std::string optText = opt.at("text").get<std::string>();
            bool isCorrect = opt.value("is_correct", false);
            std::string correctStr = isCorrect ? "true" : "false";
            std::string orderStr = std::to_string(orderNum++);

            if (orderNum - 1 < existingOptionIds.size()) {
                // Update existing option
                const char* updateParams[5];
                updateParams[0] = optText.c_str();
                updateParams[1] = correctStr.c_str();
                updateParams[2] = orderStr.c_str();
                updateParams[3] = existingOptionIds[orderNum - 1].c_str();
                updateParams[4] = questionId.c_str();
                
                PGresult* updateResult = PQexecParams(conn,
                    "UPDATE question_options SET text = $1, is_correct = $2::boolean, order_number = $3::int "
                    "WHERE id = $4 AND question_id = $5",
                    5, nullptr, updateParams, nullptr, nullptr, 0);
                PQclear(updateResult);
            } else {
                // Insert new option
                const char* insertParams[4];
                insertParams[0] = questionId.c_str();
                insertParams[1] = optText.c_str();
                insertParams[2] = correctStr.c_str();
                insertParams[3] = orderStr.c_str();

                PGresult* insertResult = PQexecParams(conn,
                    "INSERT INTO question_options (question_id, text, is_correct, order_number) VALUES ($1, $2, $3::boolean, $4::int)",
                    4, nullptr, insertParams, nullptr, nullptr, 0);
                PQclear(insertResult);
            }
        }

        // Delete excess options if fewer were sent
        if (options_json.size() < existingOptionIds.size()) {
            for (size_t i = options_json.size(); i < existingOptionIds.size(); i++) {
                const char* deleteParams[1];
                deleteParams[0] = existingOptionIds[i].c_str();
                PGresult* deleteResult = PQexecParams(conn,
                    "DELETE FROM question_options WHERE id = $1",
                    1, nullptr, deleteParams, nullptr, nullptr, 0);
                PQclear(deleteResult);
            }
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
    std::cout << "[AddQuestionToTestHandler] Called" << std::endl;
    std::string testId = matchToString(req.matches, 1);
    std::cout << "[AddQuestionToTestHandler] Test ID: " << testId << std::endl;
    std::cout << "[AddQuestionToTestHandler] Body: " << req.body << std::endl;
    
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) {
        std::cout << "[AddQuestionToTestHandler] Unauthorized" << std::endl;
        return;
    }
    std::cout << "[AddQuestionToTestHandler] User: " << ctx.user_id << std::endl;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        std::cout << "[AddQuestionToTestHandler] DB not connected" << std::endl;
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    // Resolve user UUID
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
        std::cout << "[AddQuestionToTestHandler] Resolved UUID: " << ctx_uuid << std::endl;
    }

    // Check test exists and user has permission
    const char* checkParams[1];
    checkParams[0] = testId.c_str();
    PGresult* checkResult = PQexecParams(conn,
        "SELECT c.teacher_id::text FROM tests t "
        "JOIN courses c ON t.course_id = c.id WHERE t.id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        std::cout << "[AddQuestionToTestHandler] Test not found or no course" << std::endl;
        res.status = 404;
        res.set_content("{\"error\": \"Test not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    PQclear(checkResult);
    std::cout << "[AddQuestionToTestHandler] Teacher ID: " << teacher_id << ", User UUID: " << ctx_uuid << std::endl;

    if (ctx_uuid != teacher_id) {
        std::cout << "[AddQuestionToTestHandler] User is not teacher, checking permissions" << std::endl;
        if (!CheckAccess(ctx, "test:quest:add", res)) {
            std::cout << "[AddQuestionToTestHandler] Permission denied" << std::endl;
            return;
        }
    }

    try {
        auto body = nlohmann::json::parse(req.body);
        
        // Case 1: Add existing question by question_id
        if (body.contains("question_id")) {
            std::cout << "[AddQuestionToTestHandler] Adding existing question" << std::endl;
            std::string questionId = body.at("question_id").get<std::string>();
            const char* paramValues[2];
            paramValues[0] = testId.c_str();
            paramValues[1] = questionId.c_str();
            PGresult* result = PQexecParams(conn,
                "UPDATE questions SET test_id = $1 WHERE id = $2",
                2, nullptr, paramValues, nullptr, nullptr, 0);

            if (PQresultStatus(result) != PGRES_COMMAND_OK) {
                std::cout << "[AddQuestionToTestHandler] Update failed: " << PQerrorMessage(conn) << std::endl;
                res.status = 500;
                res.set_content("{\"error\": \"Update failed\"}", "application/json");
                PQclear(result);
                return;
            }
            PQclear(result);
            std::cout << "[AddQuestionToTestHandler] Question added to test successfully" << std::endl;
            res.set_content("{\"status\": \"success\"}", "application/json");
            return;
        }
        
        // Case 2: Create new question with text and options
        if (body.contains("text")) {
            std::cout << "[AddQuestionToTestHandler] Creating new question" << std::endl;
            std::string text = body.at("text").get<std::string>();
            std::string type = body.value("type", "single_choice");
            int points = body.value("points", 1);
            
            const char* qParams[4];
            std::string pointsStr = std::to_string(points);
            qParams[0] = testId.c_str();
            qParams[1] = text.c_str();
            qParams[2] = type.c_str();
            qParams[3] = pointsStr.c_str();
            PGresult* qResult = PQexecParams(conn,
                "INSERT INTO questions (test_id, text, question_type, points) VALUES ($1, $2, $3, $4::int) RETURNING id::text",
                4, nullptr, qParams, nullptr, nullptr, 0);

            if (PQresultStatus(qResult) != PGRES_TUPLES_OK || PQntuples(qResult) == 0) {
                std::cout << "[AddQuestionToTestHandler] Insert failed: " << PQerrorMessage(conn) << std::endl;
                res.status = 500;
                res.set_content("{\"error\": \"Failed to create question\"}", "application/json");
                PQclear(qResult);
                return;
            }

            std::string q_id = PQgetvalue(qResult, 0, 0);
            PQclear(qResult);
            std::cout << "[AddQuestionToTestHandler] Created question: " << q_id << std::endl;

            // Add options if present
            if (body.contains("options") && body["options"].is_array()) {
                int order_number = 1;
                for (const auto& opt : body["options"]) {
                    std::string opt_text = opt.at("text").get<std::string>();
                    bool is_correct = opt.value("is_correct", false);
                    std::cout << "[AddQuestionToTestHandler] Adding option: " << opt_text << ", is_correct: " << is_correct << std::endl;

                    const char* optParams[4];
                    std::string isCorrectStr = is_correct ? "true" : "false";
                    std::string orderStr = std::to_string(order_number++);
                    optParams[0] = q_id.c_str();
                    optParams[1] = opt_text.c_str();
                    optParams[2] = isCorrectStr.c_str();
                    optParams[3] = orderStr.c_str();
                    PGresult* optResult = PQexecParams(conn,
                        "INSERT INTO question_options (question_id, text, is_correct, order_number) VALUES ($1, $2, $3::boolean, $4::int)",
                        4, nullptr, optParams, nullptr, nullptr, 0);
                    if (PQresultStatus(optResult) != PGRES_COMMAND_OK) {
                        std::cout << "[AddQuestionToTestHandler] Option insert failed: " << PQerrorMessage(conn) << std::endl;
                    }
                    PQclear(optResult);
                }
            }

            std::cout << "[AddQuestionToTestHandler] Question created successfully with ID: " << q_id << std::endl;
            res.status = 201;
            nlohmann::json response;
            response["status"] = "success";
            response["id"] = q_id;
            res.set_content(response.dump(), "application/json");
            return;
        }
        
        std::cout << "[AddQuestionToTestHandler] Missing question_id or text" << std::endl;
        res.status = 400;
        res.set_content("{\"error\": \"Missing question_id or text\"}", "application/json");
    } catch (const std::exception& e) {
        std::cout << "[AddQuestionToTestHandler] Exception: " << e.what() << std::endl;
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request body\"}", "application/json");
    }
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

    // Resolve user UUID
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
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

    if (ctx_uuid != teacher_id) {
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

void UpdateQuestionsOrderHandler(const httplib::Request& req, httplib::Response& res) {
    std::cout << "[UpdateQuestionsOrderHandler] Called for test ID: " << matchToString(req.matches, 1) << std::endl;
    std::cout << "[UpdateQuestionsOrderHandler] Request body: " << req.body << std::endl;
    
    std::string testId = matchToString(req.matches, 1);
    auto ctx = CheckToken(req);
    std::cout << "[UpdateQuestionsOrderHandler] User authorized: " << ctx.authorized << ", user_id: " << ctx.user_id << std::endl;
    if (Unauthorized(res, ctx)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    // Resolve user UUID
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
    }

    // Check if user owns the test
    const char* checkParams[1];
    checkParams[0] = testId.c_str();
    std::cout << "[UpdateQuestionsOrderHandler] Checking test ownership for test: " << testId << std::endl;
    PGresult* checkResult = PQexecParams(conn,
        "SELECT c.teacher_id::text FROM tests t "
        "JOIN courses c ON t.course_id = c.id WHERE t.id = $1",
        1, nullptr, checkParams, nullptr, nullptr, 0);

    std::cout << "[UpdateQuestionsOrderHandler] SQL result status: " << PQresultStatus(checkResult) << std::endl;
    std::cout << "[UpdateQuestionsOrderHandler] SQL tuples: " << PQntuples(checkResult) << std::endl;

    if (PQresultStatus(checkResult) != PGRES_TUPLES_OK || PQntuples(checkResult) == 0) {
        std::cout << "[UpdateQuestionsOrderHandler] Test not found or SQL error" << std::endl;
        res.status = 404;
        res.set_content("{\"error\": \"Test not found\"}", "application/json");
        PQclear(checkResult);
        return;
    }

    std::string teacher_id = PQgetvalue(checkResult, 0, 0);
    std::cout << "[UpdateQuestionsOrderHandler] Test teacher_id: " << teacher_id << std::endl;
    PQclear(checkResult);

    if (ctx_uuid != teacher_id) {
        std::cout << "[UpdateQuestionsOrderHandler] User is not teacher, checking permissions" << std::endl;
        if (!CheckAccess(ctx, "test:quest:order", res)) return;
    }

    // Parse JSON body with question IDs
    try {
        auto jsonBody = nlohmann::json::parse(req.body);
        if (!jsonBody.contains("question_ids") || !jsonBody["question_ids"].is_array()) {
            res.status = 400;
            res.set_content("{\"error\": \"question_ids array is required\"}", "application/json");
            return;
        }

        auto questionIds = jsonBody["question_ids"];
        
        // Update order for each question
        for (size_t i = 0; i < questionIds.size(); i++) {
            std::string questionId = questionIds[i];
            std::cout << "[UpdateQuestionsOrderHandler] Updating question " << questionId << " to order " << (i + 1) << std::endl;
            
            const char* updateParams[3];
            updateParams[0] = testId.c_str();
            updateParams[1] = questionId.c_str();
            std::string orderStr = std::to_string(i + 1);
            updateParams[2] = orderStr.c_str();
            
            std::cout << "[UpdateQuestionsOrderHandler] SQL: UPDATE questions SET order_number = " << orderStr << " WHERE test_id = " << testId << " AND id = " << questionId << std::endl;
            
            PGresult* updateResult = PQexecParams(conn,
                "UPDATE questions SET order_number = $3 WHERE test_id = $1 AND id = $2",
                3, nullptr, updateParams, nullptr, nullptr, 0);
                
            std::cout << "[UpdateQuestionsOrderHandler] Update result status: " << PQresultStatus(updateResult) << std::endl;
            if (PQresultStatus(updateResult) != PGRES_COMMAND_OK) {
                std::cout << "[UpdateQuestionsOrderHandler] SQL Error: " << PQerrorMessage(conn) << std::endl;
                PQclear(updateResult);
                res.status = 500;
                res.set_content("{\"error\": \"Failed to update question order\"}", "application/json");
                return;
            }
            PQclear(updateResult);
        }

        res.set_content("{\"status\": \"success\"}", "application/json");
        
    } catch (const std::exception& e) {
        std::cout << "[UpdateQuestionsOrderHandler] Exception: " << e.what() << std::endl;
        res.status = 400;
        res.set_content("{\"error\": \"Invalid request body\"}", "application/json");
    }
}

// ============================================================================
// ATTEMPTS API
// ============================================================================

void GetAttemptHandler(const httplib::Request& req, httplib::Response& res) {
    std::cout << "[GetAttemptHandler] Called for path: " << req.path << std::endl;
    std::string attemptId = matchToString(req.matches, 1);
    std::cout << "[GetAttemptHandler] Attempt ID: " << attemptId << std::endl;
    auto ctx = CheckToken(req);
    std::cout << "[GetAttemptHandler] Token check done, authorized: " << ctx.authorized << ", user_id: " << ctx.user_id << std::endl;
    if (Unauthorized(res, ctx)) {
        std::cout << "[GetAttemptHandler] Unauthorized, error: " << ctx.error << std::endl;
        return;
    }

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        std::cout << "[GetAttemptHandler] Database not connected" << std::endl;
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    // Resolve user UUID for comparison
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        std::cout << "[GetAttemptHandler] Resolving UUID for: " << ctx.user_id << std::endl;
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
        std::cout << "[GetAttemptHandler] Resolved to: " << ctx_uuid << std::endl;
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

    // Compare resolved UUID with attempt owner or teacher
    if (ctx_uuid != attemptUserId && ctx_uuid != teacherId) {
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

void GetAttemptAnswersHandler(const httplib::Request& req, httplib::Response& res) {
    std::string attemptId = matchToString(req.matches, 1);
    std::cout << "[GetAttemptAnswersHandler] Called for attempt: " << attemptId << std::endl;
    
    auto ctx = CheckToken(req);
    if (Unauthorized(res, ctx)) return;
    
    if (!CheckAccess(ctx, "answer:read", res)) return;

    Database& db = Database::get_instance();
    PGconn* conn = db.getConnection();
    if (!conn) {
        res.status = 500;
        res.set_content("{\"error\": \"Database not connected\"}", "application/json");
        return;
    }

    // Получаем ответы с детальной информацией о вопросах
    const char* paramValues[1];
    paramValues[0] = attemptId.c_str();
    PGresult* answersResult = PQexecParams(conn,
        "SELECT aa.id::text, aa.question_id::text, aa.option_id::text, aa.is_correct, "
        "q.text as question_text, q.points as question_points "
        "FROM attempt_answers aa "
        "JOIN questions q ON aa.question_id = q.id "
        "WHERE aa.attempt_id = $1 "
        "ORDER BY q.created_at",
        1, nullptr, paramValues, nullptr, nullptr, 0);

    nlohmann::json json_response;
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
            ans["question_text"] = PQgetvalue(answersResult, i, 4) ? PQgetvalue(answersResult, i, 4) : "";
            ans["points"] = PQgetvalue(answersResult, i, 5) ? std::stoi(PQgetvalue(answersResult, i, 5)) : 1;
            
            // Получаем варианты ответов для этого вопроса
            const char* qParams[1];
            qParams[0] = PQgetvalue(answersResult, i, 1);
            PGresult* optionsResult = PQexecParams(conn,
                "SELECT id::text, text, is_correct FROM question_options WHERE question_id = $1 ORDER BY order_number",
                1, nullptr, qParams, nullptr, nullptr, 0);
            
            nlohmann::json options = nlohmann::json::array();
            if (PQresultStatus(optionsResult) == PGRES_TUPLES_OK) {
                int optRows = PQntuples(optionsResult);
                for (int j = 0; j < optRows; j++) {
                    nlohmann::json opt;
                    opt["id"] = PQgetvalue(optionsResult, j, 0);
                    opt["text"] = PQgetvalue(optionsResult, j, 1);
                    std::string optCorrect = PQgetvalue(optionsResult, j, 2) ? PQgetvalue(optionsResult, j, 2) : "";
                    opt["is_correct"] = (optCorrect == "t" || optCorrect == "true");
                    options.push_back(opt);
                }
            }
            PQclear(optionsResult);
            
            ans["options"] = options;
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

    // Resolve user UUID for comparison
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
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

    if (ctx_uuid != attemptUserId) {
        res.status = 403;
        res.set_content("{\"error\": \"Forbidden\"}", "application/json");
        return;
    }

    if (status == "completed") {
        res.status = 400;
        res.set_content("{\"error\": \"Attempt already completed\"}", "application/json");
        return;
    }

    // Сначала подсчитываем баллы
    int correct_count = db.count_correct_answers(attemptId);
    int max_score = 0;
    
    // Подсчитываем максимальный балл по вопросам в попытке
    const char* scoreParams[1];
    scoreParams[0] = attemptId.c_str();
    PGresult* scoreResult = PQexecParams(conn,
        "SELECT COUNT(*) FROM attempt_answers WHERE attempt_id = $1",
        1, nullptr, scoreParams, nullptr, nullptr, 0);
    
    if (PQresultStatus(scoreResult) == PGRES_TUPLES_OK) {
        max_score = std::stoi(PQgetvalue(scoreResult, 0, 0));
    }
    PQclear(scoreResult);
    
    // Обновляем попытку с баллами
    if (!db.finish_test_attempt(attemptId, correct_count, max_score)) {
        std::cerr << "[FinishAttemptHandler] Failed to update attempt scores" << std::endl;
    }
    
    // Теперь завершаем попытку
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
    
    // Возвращаем результат с баллами
    nlohmann::json resp;
    resp["status"] = "success";
    resp["score"] = correct_count;
    resp["max_score"] = max_score;
    res.set_content(resp.dump(), "application/json");
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

    // Resolve user UUID for comparison
    std::string ctx_uuid = ctx.user_id;
    if (!IsUuid(ctx_uuid)) {
        ctx_uuid = ResolveOrCreateUserUUID(conn, ctx.user_id, ctx.email);
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

    if (ctx_uuid != attemptUserId) {
        res.status = 403;
        res.set_content("{\"error\": \"Forbidden\"}", "application/json");
        return;
    }

    if (status == "completed") {
        res.status = 400;
        res.set_content("{\"error\": \"Attempt already completed\"}", "application/json");
        return;
    }

    // Получаем правильность НОВОГО варианта ответа
    std::cout << "[UpdateAnswerHandler] Checking option: " << optionId << " for answer: " << answerId << std::endl;
    
    const char* answerParams[1];
    answerParams[0] = optionId.c_str();
    PGresult* answerResult = PQexecParams(conn,
        "SELECT is_correct FROM question_options WHERE id = $1",
        1, nullptr, answerParams, nullptr, nullptr, 0);

    bool isCorrect = false;
    if (PQresultStatus(answerResult) == PGRES_TUPLES_OK && PQntuples(answerResult) > 0) {
        std::string correct = PQgetvalue(answerResult, 0, 0);
        isCorrect = (correct == "t" || correct == "true");
        std::cout << "[UpdateAnswerHandler] Option " << optionId << " is_correct: " << correct << " -> " << isCorrect << std::endl;
    } else {
        std::cout << "[UpdateAnswerHandler] ERROR: Option " << optionId << " not found!" << std::endl;
    }
    PQclear(answerResult);
    
    // Обновляем ответ
    const char* paramValues[3];
    paramValues[0] = optionId.c_str();
    paramValues[1] = isCorrect ? "true" : "false";
    paramValues[2] = answerId.c_str();
    
    std::cout << "[UpdateAnswerHandler] Updating answer " << answerId << " to option " << optionId << " with is_correct=" << (isCorrect ? "true" : "false") << std::endl;
    
    PGresult* result = PQexecParams(conn,
        "UPDATE attempt_answers SET option_id = $1, is_correct = $2 WHERE id = $3",
        3, nullptr, paramValues, nullptr, nullptr, 0);

    if (PQresultStatus(result) != PGRES_COMMAND_OK) {
        std::cout << "[UpdateAnswerHandler] ERROR: Update failed!" << std::endl;
        res.status = 500;
        res.set_content("{\"error\": \"Update failed\"}", "application/json");
        PQclear(result);
        return;
    }
    std::cout << "[UpdateAnswerHandler] Update successful!" << std::endl;
    PQclear(result);
    
    // Пересчитываем баллы для этой попытки
    int correct_count = db.count_correct_answers(attemptId);
    int max_score = 0;
    
    std::cout << "[UpdateAnswerHandler] Recalculating scores for attempt " << attemptId << std::endl;
    
    // Подсчитываем максимальный балл по вопросам в попытке
    const char* scoreParams[1];
    scoreParams[0] = attemptId.c_str();
    PGresult* scoreResult = PQexecParams(conn,
        "SELECT COUNT(*) FROM attempt_answers WHERE attempt_id = $1",
        1, nullptr, scoreParams, nullptr, nullptr, 0);
    
    if (PQresultStatus(scoreResult) == PGRES_TUPLES_OK) {
        max_score = std::stoi(PQgetvalue(scoreResult, 0, 0));
    }
    PQclear(scoreResult);
    
    std::cout << "[UpdateAnswerHandler] New scores: " << correct_count << "/" << max_score << std::endl;
    
    // Обновляем баллы в попытке
    if (!db.finish_test_attempt(attemptId, correct_count, max_score)) {
        std::cerr << "[UpdateAnswerHandler] Failed to update attempt scores" << std::endl;
    } else {
        std::cout << "[UpdateAnswerHandler] Attempt scores updated successfully!" << std::endl;
    }
    
    // Возвращаем результат с обновленной информацией
    nlohmann::json resp;
    resp["status"] = "success";
    resp["is_correct"] = isCorrect;
    resp["score"] = correct_count;
    resp["max_score"] = max_score;
    
    std::cout << "[UpdateAnswerHandler] Response: " << resp.dump() << std::endl;
    res.set_content(resp.dump(), "application/json");
}

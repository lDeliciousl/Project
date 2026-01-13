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
    const bool ok = std::find(ctx.permissions.begin(), ctx.permissions.end(), value) != ctx.permissions.end();
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
    std::stringstream query;
    query << "SELECT id::text, full_name FROM users WHERE id = '" << userId << "'";
    PGresult* result = PQexec(conn, query.str().c_str());
    
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
    std::stringstream query;
    query << "SELECT c.id::text, c.name, c.description, u.full_name as teacher_name "
          << "FROM courses c "
          << "JOIN user_courses uc ON c.id = uc.course_id "
          << "LEFT JOIN users u ON c.teacher_id = u.id "
          << "WHERE uc.user_id = '" << userId << "' AND c.is_deleted = FALSE";
    
    PGresult* result = PQexec(conn, query.str().c_str());
    
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
    std::stringstream query;
    query << "SELECT t.id::text, t.name, ta.score, ta.max_score, ta.status, ta.finished_at "
          << "FROM test_attempts ta "
          << "JOIN tests t ON ta.test_id = t.id "
          << "WHERE ta.user_id = '" << userId << "' "
          << "ORDER BY ta.started_at DESC";
    
    PGresult* result = PQexec(conn, query.str().c_str());
    
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
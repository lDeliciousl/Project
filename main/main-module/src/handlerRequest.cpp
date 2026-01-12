#include "handlerRequest.h"
#include "postgres.h"
#include <iostream>
#include <vector>
#include <string>
#include <sstream>

// ============================================================================
// ЗАГЛУШКИ ДЛЯ ФУНКЦИЙ
// ============================================================================

bool Unauthorized(httplib::Response& res, std::unordered_map<std::string, jwt_stub::claim> permission) {
    if (permission.empty()) {
        res.status = 401;
        res.set_content("{\"error\": \"Unauthorized\"}", "application/json");
        return true;
    }
    return false;
}

bool CheckAccess(std::unordered_map<std::string, jwt_stub::claim> permission, std::string value, httplib::Response& res) {
    // Всегда разрешаем в заглушке
    return true;
}

bool IsThisUser(std::unordered_map<std::string, jwt_stub::claim> permission, int uid, httplib::Response& res) {
    // Всегда true в заглушке
    return true;
}

// Заглушки для SQL функций
std::vector<int> sql_get_list_int(const std::string& column, const std::string& table) {
    std::cout << "[SQL STUB] get_list_int: " << column << " from " << table << std::endl;
    return {1, 2, 3};  // Возвращаем тестовые данные
}

std::vector<std::string> sql_get_list_str(const std::string& column, const std::string& table) {
    std::cout << "[SQL STUB] get_list_str: " << column << " from " << table << std::endl;
    return {"User1", "User2", "User3"};
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
    auto permission = CheckToken(req);
    if (Unauthorized(res, permission)) return;
    
    // Проверка доступа
    if (!CheckAccess(permission, "admin", res)) return;
    
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
    
    auto permission = CheckToken(req);
    if (Unauthorized(res, permission)) return;
    
    // Получаем данные через заглушки
    std::vector<int> uids = sql_get_list_int("id", "users");
    std::vector<std::string> names = sql_get_list_str("last_name", "users");
    
    // Формируем JSON ответ
    std::string json = "{\"users\": [";
    for (size_t i = 0; i < std::min(uids.size(), names.size()); i++) {
        if (i > 0) json += ",";
        json += "{\"id\": " + std::to_string(uids[i]) + 
                ", \"name\": \"" + names[i] + "\"}";
    }
    json += "]}";
    
    res.set_content(json, "application/json");
}

// Обработчик для получения имени пользователя
void GetUserNameHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserNameHandler] Called for user: " << userId << std::endl;
    
    auto permission = CheckToken(req);
    if (Unauthorized(res, permission)) return;
    
    int requestedUid = matchToInt(req.matches, 1);
    if (!IsThisUser(permission, requestedUid, res)) return;
    
    res.set_content("{\"id\": " + userId + 
                    ", \"name\": \"Test User " + userId + "\"}", 
                    "application/json");
}

// Остальные обработчики - аналогичные заглушки
void SetUserNameHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[SetUserNameHandler] Called for user: " << userId << std::endl;
    auto permission = CheckToken(req);
    if (!Unauthorized(res, permission)) {
        res.set_content("{\"status\": \"success\", \"message\": \"Name updated for user " + userId + "\"}", "application/json");
    }
}

void GetUserCoursesHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserCoursesHandler] Called for user: " << userId << std::endl;
    auto permission = CheckToken(req);
    if (!Unauthorized(res, permission)) {
        res.set_content("{\"courses\": [\"Math\", \"Physics\", \"Chemistry\"]}", "application/json");
    }
}

void GetUserGradesHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserGradesHandler] Called for user: " << userId << std::endl;
    auto permission = CheckToken(req);
    if (!Unauthorized(res, permission)) {
        res.set_content("{\"grades\": {\"Math\": 85, \"Physics\": 90, \"Chemistry\": 78}}", "application/json");
    }
}

void GetUserTestsHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserTestsHandler] Called for user: " << userId << std::endl;
    auto permission = CheckToken(req);
    if (!Unauthorized(res, permission)) {
        res.set_content("{\"tests\": [\"Midterm\", \"Final\", \"Quiz\"]}", "application/json");
    }
}

void GetUserRolesHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[GetUserRolesHandler] Called for user: " << userId << std::endl;
    auto permission = CheckToken(req);
    if (!Unauthorized(res, permission)) {
        res.set_content("{\"roles\": [\"student\", \"user\"]}", "application/json");
    }
}

void SetUserRolesHandler(const httplib::Request& req, httplib::Response& res) {
    std::string userId = matchToString(req.matches, 1);
    std::cout << "[SetUserRolesHandler] Called for user: " << userId << std::endl;
    auto permission = CheckToken(req);
    if (!Unauthorized(res, permission)) {
        res.set_content("{\"status\": \"success\", \"message\": \"Roles updated\"}", "application/json");
    }
}

// ============================================================================
// ПРОСТЫЕ ОБРАБОТЧИКИ ДЛЯ ОСНОВНЫХ МЕТОДОВ
// ============================================================================

void handleGetRequest(const httplib::Request& req, httplib::Response& res) {
    std::cout << "GET request to: " << req.path << std::endl;
    
    // Простая проверка токена
    std::string token = findToken(req);
    if (!token.empty()) {
        res.set_content("{\"status\": \"success\", \"message\": \"Authorized\", \"path\": \"" + req.path + "\"}", "application/json");
    } else {
        res.status = 401;
        res.set_content("{\"status\": \"error\", \"message\": \"Unauthorized\"}", "application/json");
    }
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
    auto permission = CheckToken(req);
    if (Unauthorized(res, permission)) return;

    // Например, разрешение "pass_test"
    if (!CheckAccess(permission, "pass_test", res)) return;

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
    auto permission = CheckToken(req);
    if (Unauthorized(res, permission)) return;
    
    // Check if user is teacher/admin (stub check)
    if (!CheckAccess(permission, "create_test", res)) return;

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
    auto permission = CheckToken(req);
    if (Unauthorized(res, permission)) return;
    
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
    auto permission = CheckToken(req);
    if (Unauthorized(res, permission)) return;

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
    auto permission = CheckToken(req);
    if (Unauthorized(res, permission)) return;

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
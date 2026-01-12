#include "handlerRequest.h"
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

    // Например, разрешение \"pass_test\"
    if (!CheckAccess(permission, "pass_test", res)) return;

    try {
        // 2) Разбираем JSON-тело запроса
        // Ожидаем формат:
        // {
        //   "test_id": "uuid",
        //   "user_id": "uuid",
        //   "answers": [
        //     { "question_id": "uuid", "option_id": "uuid" }
        //   ]
        // }
        nlohmann::json body = nlohmann::json::parse(req.body);

        std::string test_id  = body.at("test_id").get<std::string>();
        std::string user_id  = body.at("user_id").get<std::string>();

        // answers мы пока просто считаем, без сохранения в БД
        size_t answers_count = 0;
        if (body.contains("answers") && body["answers"].is_array()) {
            answers_count = body["answers"].size();
        }

        std::cout << "[CreateTestAttemptHandler] test_id=" << test_id
                  << " user_id=" << user_id
                  << " answers=" << answers_count << std::endl;

        // 3) Здесь позже будет реальная работа с БД:
        //  - создать попытку теста
        //  - записать ответы
        //  - посчитать результат

        // 4) Формируем JSON-ответ
        nlohmann::json resp;
        resp["status"] = "success";
        resp["message"] = "Test attempt created (stub)";
        resp["test_id"] = test_id;
        resp["user_id"] = user_id;
        resp["answers_count"] = answers_count;

        res.status = 201;
        res.set_content(resp.dump(), "application/json");
    } catch (const std::exception& ex) {
        std::cerr << "[CreateTestAttemptHandler] Error: " << ex.what() << std::endl;
        res.status = 400;
        res.set_content("{\"error\": \"Invalid JSON body\"}", "application/json");
    }
}
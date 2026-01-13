#include <iostream>
#include <cstdlib>
#include "httplib.h"
#include "handlerFunctions.h"
#include "handlerRequest.h"
#include "../include/utils/config.hpp"

int main() {
    std::cout << "=== Starting Server ===" << std::endl;
    
    // Загружаем конфигурацию из переменных окружения
    Config& config = Config::get_instance();
    config.load_from_env();
    config.print();
    
    // Инициализация базы данных
    PostgresInit();
    
    httplib::Server server;
    
    // Простые маршруты
    server.Get("/", [](const httplib::Request& req, httplib::Response& res) {
        res.set_content("Hello from server!", "text/plain");
    });
    
    server.Get("/api/test", handleGetRequest);
    server.Post("/api/data", handlePostRequest);
    // Пример ручки с JSON-телом для создания попытки теста
    server.Post("/api/tests/attempts", CreateTestAttemptHandler);
    
    // Test management routes
    server.Post("/api/tests", CreateTestHandler);
    server.Get("/api/tests", GetTestsHandler);
    server.Get(R"(/api/tests/([^/]+))", GetTestDetailsHandler);
    server.Post(R"(/api/tests/([^/]+)/questions)", AddQuestionHandler);
    
    server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\": \"ok\"}", "application/json");
    });
    
    // Обработчик несовпадающих запросов
    server.set_error_handler(handle_unmatched_request);
    
    // API для работы с пользователями
    server.Post("/api/db/addUser", AddUser);    // добавляет нового пользователя в бд после регистрации
    server.Get("/api/db/users", GetUserList);    // Посмотреть список пользователей
    server.Get(R"(/api/db/users/([^/]+)/name)", GetUserNamea);    // Посмотреть информацию о пользователе (ФИО)
    server.Put(R"(/api/db/users/([^/]+)/name)", SetUserName);    // Изменить ФИО пользователя
    server.Get(R"(/api/db/users/([^/]+)/courses)", GetUserCourses);    // Посмотреть информацию о пользователе (курсы)
    server.Get(R"(/api/db/users/([^/]+)/grades)", GetUserGrades);    // Посмотреть информацию о пользователе (оценки)
    server.Get(R"(/api/db/users/([^/]+)/tests)", GetUserTests);    // Посмотреть информацию о пользователе (тесты)
    server.Get(R"(/api/db/users/([^/]+)/roles)", GetUserRoles);    // Посмотреть информацию о пользователе (роли)
    server.Put(R"(/api/db/users/([^/]+)/roles)", SetUserRoles);    // Изменить роли пользователя

    server.Get("/notification", GetNotificationsHandler);
    server.Delete("/notification", ClearNotificationsHandler);
    
    // Получаем порт из конфигурации или используем значение по умолчанию
    std::string port_str = config.get("server.port", "3002");
    int port = std::stoi(port_str);
    
    std::cout << "Server listening on http://0.0.0.0:" << port << std::endl;
    std::cout << "Press Ctrl+C to stop" << std::endl;
    
    server.listen("0.0.0.0", port);
    
    return 0;
}

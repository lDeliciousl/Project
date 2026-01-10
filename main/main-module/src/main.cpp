#include <iostream>
#include "httplib.h"
#include "handlerFunctions.h"  // Добавьте эту строку
#include "handlerRequest.h"

int main() {
    std::cout << "=== Starting Server ===" << std::endl;
    
    // Инициализация базы данных
    PostgresInit();
    
    httplib::Server server;
    
    // Простые маршруты
    server.Get("/", [](const httplib::Request& req, httplib::Response& res) {
        res.set_content("Hello from server!", "text/plain");
    });
    
    server.Get("/api/test", handleGetRequest);
    server.Post("/api/data", handlePostRequest);
    
    server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\": \"ok\"}", "application/json");
    });
    
    // Обработчик несовпадающих запросов
    server.set_error_handler(handle_unmatched_request);
    
    // API для работы с пользователями
    server.Post("/api/db/addUser", AddUser);    // добавляет нового пользователя в бд после регистрации
    server.Get("/api/db/users", GetUserList);    // Посмотреть список пользователей
    server.Get(R"(/api/db/users/(\d+)/name)", GetUserNamea);    // Посмотреть информацию о пользователе (ФИО)
    server.Put(R"(/api/db/users/(\d+)/name)", SetUserName);    // Изменить ФИО пользователя
    server.Get(R"(/api/db/users/(\d+)/courses)", GetUserCourses);    // Посмотреть информацию о пользователе (курсы)
    server.Get(R"(/api/db/users/(\d+)/grades)", GetUserGrades);    // Посмотреть информацию о пользователе (оценки)
    server.Get(R"(/api/db/users/(\d+)/tests)", GetUserTests);    // Посмотреть информацию о пользователе (тесты)
    server.Get(R"(/api/db/users/(\d+)/roles)", GetUserRoles);    // Посмотреть информацию о пользователе (роли)
    server.Put(R"(/api/db/users/(\d+)/roles)", SetUserRoles);    // Изменить роли пользователя
    
    std::cout << "Server listening on http://localhost:8080" << std::endl;
    std::cout << "Press Ctrl+C to stop" << std::endl;
    
    server.listen("0.0.0.0", 8080);
    
    return 0;
}

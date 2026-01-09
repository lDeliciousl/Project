#include "server/simple_server.hpp"
#include <iostream>
#include <chrono>

SimpleServer::SimpleServer(int port) 
    : port_(port), app_(std::make_unique<crow::SimpleApp>()) {
    setup_routes();
    std::cout << "🔧 HTTP сервер инициализирован на порту " << port_ << std::endl;
}

void SimpleServer::setup_routes() {
    // Главная страница
    CROW_ROUTE(app_->operator*(), "/")
    ([]() {
        return "🚀 Главный модуль системы тестирования\n"
               "Версия: 1.0.0\n"
               "Используйте /health для проверки состояния";
    });
    
    // Health check
    CROW_ROUTE(app_->operator*(), "/health")
    ([]() {
        crow::json::wvalue response;
        response["status"] = "healthy";
        response["service"] = "main-module";
        response["timestamp"] = static_cast<int>(
            std::chrono::system_clock::to_time_t(
                std::chrono::system_clock::now()
            )
        );
        return crow::response(response);
    });
    
    // Простой тестовый endpoint
    CROW_ROUTE(app_->operator*(), "/api/test")
    ([]() {
        crow::json::wvalue response;
        response["message"] = "Hello from Main Module!";
        response["version"] = "1.0.0";
        response["endpoints"] = crow::json::wvalue::list({"/health", "/api/test"});
        return crow::response(response);
    });
    
    // Echo endpoint для тестирования POST
    CROW_ROUTE(app_->operator*(), "/api/echo")
    .methods("POST"_method)
    ([](const crow::request& req) {
        try {
            crow::json::wvalue response;
            response["method"] = "POST";
            response["body"] = req.body;
            response["success"] = true;
            return crow::response(response);
        } catch (...) {
            crow::json::wvalue error;
            error["error"] = "Invalid request";
            error["success"] = false;
            return crow::response(400, error);
        }
    });
}

void SimpleServer::run() {
    std::cout << "🚀 HTTP сервер запущен на http://0.0.0.0:" << port_ << std::endl;
    std::cout << "📌 Доступные эндпоинты:" << std::endl;
    std::cout << "   GET  /" << std::endl;
    std::cout << "   GET  /health" << std::endl;
    std::cout << "   GET  /api/test" << std::endl;
    std::cout << "   POST /api/echo" << std::endl;
    std::cout << "========================================" << std::endl;
    
    app_->port(port_).multithreaded().run();
}

void SimpleServer::stop() {
    std::cout << "🛑 Остановка HTTP сервера..." << std::endl;
}

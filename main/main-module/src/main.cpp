#include <crow.h>
#include <pqxx/pqxx>
#include <jwt-cpp/jwt.h>
#include <iostream>

int main() {
    // 1. Подключение к PostgreSQL
    pqxx::connection db_conn(
        "host=" + std::string(getenv("DB_HOST")) + " " +
        "port=" + std::string(getenv("DB_PORT")) + " " +
        "dbname=" + std::string(getenv("DB_NAME")) + " " +
        "user=" + std::string(getenv("DB_USER")) + " " +
        "password=" + std::string(getenv("DB_PASSWORD"))
    );
    
    if (!db_conn.is_open()) {
        std::cerr << "Failed to connect to PostgreSQL" << std::endl;
        return 1;
    }
    
    // 2. Создаём HTTP-сервер
    crow::SimpleApp app;
    
    // 3. Health-check эндпоинт для проверки
    CROW_ROUTE(app, "/health")
    ([]() {
        return crow::response(200, "{\"status\": \"ok\", \"service\": \"main-module\"}");
    });
    
    // 4. Пример защищённого эндпоинта (пока заглушка)
    CROW_ROUTE(app, "/api/users/<string>")
    .methods("GET"_method)
    ([](const crow::request& req, const std::string& user_id) {
        // Здесь будет проверка JWT токена из заголовка Authorization
        auto auth_header = req.get_header_value("Authorization");
        
        if (auth_header.empty()) {
            return crow::response(401, "{\"error\": \"No token provided\"}");
        }
        
        // TODO: Проверить JWT токен
        // TODO: Проверить права пользователя
        // TODO: Сделать запрос к PostgreSQL
        
        return crow::response(200, "{\"message\": \"User data endpoint\", \"userId\": \"" + user_id + "\"}");
    });
    
    // 5. Запускаем сервер на порту 3002
    std::cout << "🚀 Главный модуль запущен на порту 3002" << std::endl;
    app.port(3002).multithreaded().run();
    
    return 0;
}
#include <iostream>
#include <httplib.h>
#include "handlerRequest.h"
#include "postgres.h"
#include "../include/utils/config.hpp"

// Инициализация базы данных
void PostgresInit() {
    std::cout << "[DB] Initializing database..." << std::endl;
    SetConsoleOutputCP(65001);  // UTF-8
    
    // Загружаем конфигурацию если еще не загружена
    Config& config = Config::get_instance();
    if (!config.is_loaded()) {
        config.load_from_env();
    }
    
    // Подключаемся к базе данных через singleton (подключение происходит внутри get_instance)
    Database& db = Database::get_instance();
    
    std::cout << "[DB] ✅ Database initialization completed" << std::endl;
}

// Обработчик несовпадающих запросов
void handle_unmatched_request(const httplib::Request& req, httplib::Response& res) {
    // Если ответ уже сформирован (любой статус кроме 0), не переписываем его
    if (res.status != 0) {
        // Только логируем если это реально 404 от нас
        if (res.status == 404 && res.body.find("\"path\"") != std::string::npos) {
            std::cout << "[ERROR] Unmatched request: " << req.method << " " << req.path << std::endl;
        }
        return;
    }

    std::cout << "[ERROR] Unmatched request: " << req.method << " " << req.path << std::endl;
    res.status = 404;
    res.set_content("{\"error\": \"Not found\", \"path\": \"" + req.path + "\"}", "application/json");
}

// Обработчики теперь определены в handlerRequest.cpp
// Макросы в handlerFunctions.h перенаправляют вызовы

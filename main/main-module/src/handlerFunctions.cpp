#include <iostream>
#include <httplib.h>
#include "handlerRequest.h"

// Инициализация базы данных
void PostgresInit() {
    std::cout << "[DB] Initializing database..." << std::endl;
    SetConsoleOutputCP(65001);  // UTF-8
    
    // Здесь могла бы быть реальная инициализация базы данных
    std::cout << "[DB] Database initialized (stub mode)" << std::endl;
}

// Обработчик несовпадающих запросов
void handle_unmatched_request(const httplib::Request& req, httplib::Response& res) {
    std::cout << "[ERROR] Unmatched request: " << req.method << " " << req.path << std::endl;
    res.status = 404;
    res.set_content("{\"error\": \"Not found\", \"path\": \"" + req.path + "\"}", "application/json");
}

// Обработчики теперь определены в handlerRequest.cpp
// Макросы в handlerFunctions.h перенаправляют вызовы

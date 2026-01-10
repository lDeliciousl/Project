#pragma once

#include <string>
#include <iostream>
#include <memory>

// Кроссплатформенные заголовки
#ifdef _WIN32
    #include <windows.h>
#else
    // Для macOS/Linux ничего не нужно
    #include <unistd.h>
#endif

// Объявления функций
void initDatabase();
std::string queryDatabase(const std::string& query);
void closeDatabase();

// Или класс
class Database {
public:
    Database();
    ~Database();
    
    bool connect(const std::string& connStr);
    bool execute(const std::string& query);
    void disconnect();
    
private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
};

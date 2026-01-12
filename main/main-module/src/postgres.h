#pragma once

#include <string>
#include <iostream>
#include <memory>
#include <vector>
#include <map>

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

// Структуры для работы с тестами
struct TestAttempt {
    std::string id;
    std::string test_id;
    std::string user_id;
    std::string status;
    int score;
    int max_score;
};

struct Answer {
    std::string question_id;
    std::string option_id;
};

// Или класс
class Database {
public:
    Database();
    ~Database();
    
    bool connect(const std::string& connStr);
    bool execute(const std::string& query);
    void disconnect();
    
    // Функции для работы с тестами
    std::string create_test_attempt(const std::string& test_id, const std::string& user_id);
    bool save_attempt_answers(const std::string& attempt_id, const std::vector<Answer>& answers);
    bool finish_test_attempt(const std::string& attempt_id, int score, int max_score);
    TestAttempt get_test_attempt(const std::string& attempt_id);
    int count_correct_answers(const std::string& attempt_id);
    
    // Получить глобальный экземпляр БД
    static Database& get_instance();
    
private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
    static std::unique_ptr<Database> instance_;
};

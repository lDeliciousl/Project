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

struct QuestionOption {
    std::string id;
    std::string text;
    bool is_correct;
};

struct Question {
    std::string id;
    std::string text;
    std::string type;
    int points;
    std::vector<QuestionOption> options;
};

struct Test {
    std::string id;
    std::string name;
    std::string description;
    std::string course_id;
    std::string created_by;
    std::vector<Question> questions;
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

    // Новые функции для управления тестами
    std::string create_test(const std::string& name, const std::string& description, const std::string& course_id, const std::string& created_by);
    std::string add_question(const std::string& test_id, const std::string& text, const std::string& type, int points);
    std::string add_option(const std::string& question_id, const std::string& text, bool is_correct);
    Test get_test_details(const std::string& test_id);
    std::vector<Test> get_all_tests();
    
    // Получить глобальный экземпляр БД
    static Database& get_instance();
    
private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
    static std::unique_ptr<Database> instance_;
};

#include "postgres.h"
#include <libpq-fe.h>
#include <stdexcept>
#include <sstream>
#include <iomanip>
#include <locale>
#include "../include/utils/config.hpp"

// Для кодировки (если нужно)
void setConsoleEncoding() {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
#else
    // На macOS/Linux UTF-8 по умолчанию
    setlocale(LC_ALL, "en_US.UTF-8");
#endif
}

// Инициализация статического экземпляра
std::unique_ptr<Database> Database::instance_ = nullptr;

struct Database::Impl {
    PGconn* connection = nullptr;
};

Database::Database() : pImpl(std::make_unique<Impl>()) {}

Database::~Database() {
    disconnect();
}

Database& Database::get_instance() {
    if (!instance_) {
        instance_ = std::unique_ptr<Database>(new Database());
        
        // Подключаемся используя Config
        Config& config = Config::get_instance();
        std::stringstream connStr;
        connStr << "host=" << config.get("db.host", "main-postgres")
                << " port=" << config.get("db.port", "5432")
                << " dbname=" << config.get("db.name", "testing_system")
                << " user=" << config.get("db.user", "main_module")
                << " password=" << config.get("db.password", "secret123");
        
        if (!instance_->connect(connStr.str())) {
            std::cerr << "[ERROR] Failed to connect to database" << std::endl;
        }
    }
    return *instance_;
}

bool Database::connect(const std::string& connStr) {
    if (pImpl->connection) {
        disconnect();
    }
    
    pImpl->connection = PQconnectdb(connStr.c_str());
    
    if (PQstatus(pImpl->connection) != CONNECTION_OK) {
        std::cerr << "[ERROR] Connection failed: " << PQerrorMessage(pImpl->connection) << std::endl;
        disconnect();
        return false;
    }
    
    std::cout << "[DB] ✅ Connected to database successfully" << std::endl;
    return true;
}

bool Database::execute(const std::string& query) {
    if (!pImpl->connection) {
        std::cerr << "[ERROR] Not connected to database" << std::endl;
        return false;
    }
    
    PGresult* result = PQexec(pImpl->connection, query.c_str());
    
    if (PQresultStatus(result) != PGRES_COMMAND_OK && 
        PQresultStatus(result) != PGRES_TUPLES_OK) {
        std::cerr << "[ERROR] Query failed: " << PQerrorMessage(pImpl->connection) << std::endl;
        PQclear(result);
        return false;
    }
    
    PQclear(result);
    return true;
}

void Database::disconnect() {
    if (pImpl->connection) {
        PQfinish(pImpl->connection);
        pImpl->connection = nullptr;
        std::cout << "[DB] Database disconnected" << std::endl;
    }
}

// Функции для работы с тестами
std::string Database::create_test_attempt(const std::string& test_id, const std::string& user_id) {
    if (!pImpl->connection) {
        std::cerr << "[ERROR] Not connected to database" << std::endl;
        return "";
    }
    
    std::stringstream query;
    query << "INSERT INTO test_attempts (test_id, user_id, status) VALUES ('"
          << test_id << "', '" << user_id << "', 'in_progress') RETURNING id";
    
    PGresult* result = PQexec(pImpl->connection, query.str().c_str());
    
    if (PQresultStatus(result) != PGRES_TUPLES_OK) {
        std::cerr << "[ERROR] Failed to create test attempt: " << PQerrorMessage(pImpl->connection) << std::endl;
        PQclear(result);
        return "";
    }
    
    std::string attempt_id = PQgetvalue(result, 0, 0);
    PQclear(result);
    
    std::cout << "[DB] Created test attempt: " << attempt_id << std::endl;
    return attempt_id;
}

bool Database::save_attempt_answers(const std::string& attempt_id, const std::vector<Answer>& answers) {
    if (!pImpl->connection) {
        std::cerr << "[ERROR] Not connected to database" << std::endl;
        return false;
    }
    
    // Начинаем транзакцию
    PGresult* begin = PQexec(pImpl->connection, "BEGIN");
    PQclear(begin);
    
    bool success = true;
    
    for (const auto& answer : answers) {
        // Проверяем правильность ответа
        std::stringstream checkQuery;
        checkQuery << "SELECT is_correct FROM question_options WHERE id = '"
                   << answer.option_id << "' AND question_id = '" << answer.question_id << "'";
        
        PGresult* checkResult = PQexec(pImpl->connection, checkQuery.str().c_str());
        bool is_correct = false;
        
        if (PQresultStatus(checkResult) == PGRES_TUPLES_OK && PQntuples(checkResult) > 0) {
            is_correct = (PQgetvalue(checkResult, 0, 0)[0] == 't');
        }
        PQclear(checkResult);
        
        // Сохраняем ответ
        std::stringstream insertQuery;
        insertQuery << "INSERT INTO attempt_answers (attempt_id, question_id, option_id, is_correct) "
                   << "VALUES ('" << attempt_id << "', '" << answer.question_id 
                   << "', '" << answer.option_id << "', " << (is_correct ? "TRUE" : "FALSE") << ") "
                   << "ON CONFLICT (attempt_id, question_id) DO UPDATE SET "
                   << "option_id = EXCLUDED.option_id, is_correct = EXCLUDED.is_correct";
        
        PGresult* insertResult = PQexec(pImpl->connection, insertQuery.str().c_str());
        if (PQresultStatus(insertResult) != PGRES_COMMAND_OK) {
            std::cerr << "[ERROR] Failed to save answer: " << PQerrorMessage(pImpl->connection) << std::endl;
            success = false;
        }
        PQclear(insertResult);
    }
    
    // Коммитим или откатываем транзакцию
    if (success) {
        PGresult* commit = PQexec(pImpl->connection, "COMMIT");
        PQclear(commit);
        std::cout << "[DB] Saved " << answers.size() << " answers for attempt " << attempt_id << std::endl;
    } else {
        PGresult* rollback = PQexec(pImpl->connection, "ROLLBACK");
        PQclear(rollback);
    }
    
    return success;
}

bool Database::finish_test_attempt(const std::string& attempt_id, int score, int max_score) {
    if (!pImpl->connection) {
        std::cerr << "[ERROR] Not connected to database" << std::endl;
        return false;
    }
    
    std::stringstream query;
    query << "UPDATE test_attempts SET finished_at = CURRENT_TIMESTAMP, "
          << "score = " << score << ", max_score = " << max_score 
          << ", status = 'completed' WHERE id = '" << attempt_id << "'";
    
    bool success = execute(query.str());
    
    if (success) {
        std::cout << "[DB] Finished test attempt " << attempt_id << " with score " << score << "/" << max_score << std::endl;
    }
    
    return success;
}

TestAttempt Database::get_test_attempt(const std::string& attempt_id) {
    TestAttempt attempt;
    
    if (!pImpl->connection) {
        std::cerr << "[ERROR] Not connected to database" << std::endl;
        return attempt;
    }
    
    std::stringstream query;
    query << "SELECT id, test_id, user_id, status, score, max_score "
          << "FROM test_attempts WHERE id = '" << attempt_id << "'";
    
    PGresult* result = PQexec(pImpl->connection, query.str().c_str());
    
    if (PQresultStatus(result) == PGRES_TUPLES_OK && PQntuples(result) > 0) {
        attempt.id = PQgetvalue(result, 0, 0);
        attempt.test_id = PQgetvalue(result, 0, 1);
        attempt.user_id = PQgetvalue(result, 0, 2);
        attempt.status = PQgetvalue(result, 0, 3);
        attempt.score = std::stoi(PQgetvalue(result, 0, 4) ? PQgetvalue(result, 0, 4) : "0");
        attempt.max_score = std::stoi(PQgetvalue(result, 0, 5) ? PQgetvalue(result, 0, 5) : "0");
    }
    
    PQclear(result);
    return attempt;
}

int Database::count_correct_answers(const std::string& attempt_id) {
    if (!pImpl->connection) {
        std::cerr << "[ERROR] Not connected to database" << std::endl;
        return 0;
    }
    
    std::stringstream query;
    query << "SELECT COUNT(*) FROM attempt_answers WHERE attempt_id = '"
          << attempt_id << "' AND is_correct = TRUE";
    
    PGresult* result = PQexec(pImpl->connection, query.str().c_str());
    int count = 0;
    
    if (PQresultStatus(result) == PGRES_TUPLES_OK && PQntuples(result) > 0) {
        count = std::stoi(PQgetvalue(result, 0, 0));
    }
    
    PQclear(result);
    return count;
}

// Старые функции для совместимости
void initDatabase() {
    setConsoleEncoding();
    std::cout << "[DB] Database initialization (stub)" << std::endl;
}

std::string queryDatabase(const std::string& query) {
    // Заглушка
    return "Query result stub";
}

void closeDatabase() {
    std::cout << "[DB] Database closed (stub)" << std::endl;
}

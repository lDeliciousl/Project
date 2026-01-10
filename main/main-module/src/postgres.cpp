#include "postgres.h"
#include <libpq-fe.h>
#include <stdexcept>

// Для кодировки (если нужно)
void setConsoleEncoding() {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
#else
    // На macOS/Linux UTF-8 по умолчанию
    setlocale(LC_ALL, "en_US.UTF-8");
#endif
}

struct Database::Impl {
    PGconn* connection = nullptr;
};

Database::Database() : pImpl(std::make_unique<Impl>()) {}

Database::~Database() {
    disconnect();
}

bool Database::connect(const std::string& connStr) {
    if (pImpl->connection) {
        disconnect();
    }
    
    pImpl->connection = PQconnectdb(connStr.c_str());
    
    if (PQstatus(pImpl->connection) != CONNECTION_OK) {
        std::cerr << "Connection failed: " << PQerrorMessage(pImpl->connection) << std::endl;
        disconnect();
        return false;
    }
    
    std::cout << "Connected to database successfully" << std::endl;
    return true;
}

bool Database::execute(const std::string& query) {
    if (!pImpl->connection) {
        std::cerr << "Not connected to database" << std::endl;
        return false;
    }
    
    PGresult* result = PQexec(pImpl->connection, query.c_str());
    
    if (PQresultStatus(result) != PGRES_COMMAND_OK && 
        PQresultStatus(result) != PGRES_TUPLES_OK) {
        std::cerr << "Query failed: " << PQerrorMessage(pImpl->connection) << std::endl;
        PQclear(result);
        return false;
    }
    
    // Обработка результата если нужно
    int rows = PQntuples(result);
    std::cout << "Query executed, rows affected: " << rows << std::endl;
    
    PQclear(result);
    return true;
}

void Database::disconnect() {
    if (pImpl->connection) {
        PQfinish(pImpl->connection);
        pImpl->connection = nullptr;
        std::cout << "Database disconnected" << std::endl;
    }
}

// Старые функции для совместимости
void initDatabase() {
    setConsoleEncoding();
    std::cout << "Database initialization (stub)" << std::endl;
}

std::string queryDatabase(const std::string& query) {
    // Заглушка
    return "Query result stub";
}

void closeDatabase() {
    std::cout << "Database closed (stub)" << std::endl;
}

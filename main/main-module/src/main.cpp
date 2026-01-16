#include <iostream>
#include <cstdlib>
#include "httplib.h"
#include "handlerFunctions.h"
#include "handlerRequest.h"
#include "../include/utils/config.hpp"

int main() {
    std::cout << "=== Starting Server ===" << std::endl;
    
    // Загружаем конфигурацию из переменных окружения
    Config& config = Config::get_instance();
    config.load_from_env();
    config.print();
    
    // Инициализация базы данных
    PostgresInit();
    
    httplib::Server server;
    
    // Простые маршруты
    server.Get("/", [](const httplib::Request& req, httplib::Response& res) {
        res.set_content("Hello from server!", "text/plain");
    });
    
    server.Get("/api/test", handleGetRequest);
    server.Post("/api/data", handlePostRequest);
    // Пример ручки с JSON-телом для создания попытки теста
    server.Post("/api/tests/attempts", CreateTestAttemptHandler);
    
    // Test management routes
    server.Post("/api/tests", CreateTestHandler);
    server.Get("/api/tests", GetTestsHandler);
    // More specific routes first
    server.Put(R"(/api/tests/([^/]+)/activate)", ActivateTestHandler);
    server.Post(R"(/api/tests/([^/]+)/questions)", AddQuestionToTestHandler);
    server.Delete(R"(/api/tests/([^/]+)/questions/([^/]+))", RemoveQuestionFromTestHandler);
    server.Put(R"(/api/tests/([^/]+)/questions/order)", UpdateQuestionsOrderHandler);
    // Generic routes after
    server.Get(R"(/api/tests/([^/]+))", GetTestDetailsHandler);
    server.Put(R"(/api/tests/([^/]+))", UpdateTestHandler);
    server.Delete(R"(/api/tests/([^/]+))", DeleteTestHandler);
    
    server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\": \"ok\"}", "application/json");
    });
    
    // API для работы с пользователями
    server.Post("/api/db/addUser", AddUserHandler);    // добавляет нового пользователя в бд после регистрации
    server.Get("/api/db/users", GetUserListHandler);    // Посмотреть список пользователей
    server.Get(R"(/api/db/users/([^/]+)/name)", GetUserNameHandler);    // Посмотреть информацию о пользователе (ФИО)
    server.Put(R"(/api/db/users/([^/]+)/name)", SetUserNameHandler);    // Изменить ФИО пользователя
    server.Get(R"(/api/db/users/([^/]+)/courses)", GetUserCoursesHandler);    // Посмотреть информацию о пользователе (курсы)
    server.Get(R"(/api/db/users/([^/]+)/grades)", GetUserGradesHandler);    // Посмотреть информацию о пользователе (оценки)
    server.Get(R"(/api/db/users/([^/]+)/tests)", GetUserTestsHandler);    // Посмотреть информацию о пользователе (тесты)
    server.Get(R"(/api/db/users/([^/]+)/roles)", GetUserRolesHandler);    // Посмотреть информацию о пользователе (роли)
    server.Put(R"(/api/db/users/([^/]+)/roles)", SetUserRolesHandler);    // Изменить роли пользователя

    server.Get(R"(/api/db/users/([^/]+)/block)", GetUserBlockedHandler);
    server.Put(R"(/api/db/users/([^/]+)/block)", SetUserBlockedHandler);

    server.Get("/notification", GetNotificationsHandler);
    server.Delete("/notification", ClearNotificationsHandler);

    // Courses API
    server.Get("/api/courses", GetCoursesListHandler);
    server.Get(R"(/api/courses/([^/]+))", GetCourseInfoHandler);
    server.Post("/api/courses", CreateCourseHandler);
    server.Put(R"(/api/courses/([^/]+))", UpdateCourseHandler);
    server.Delete(R"(/api/courses/([^/]+))", DeleteCourseHandler);
    server.Get(R"(/api/courses/([^/]+)/students)", GetCourseStudentsHandler);
    server.Get(R"(/api/courses/([^/]+)/tests)", GetCourseTestsHandler);
    server.Post(R"(/api/courses/([^/]+)/enroll)", EnrollUserHandler);
    server.Delete(R"(/api/courses/([^/]+)/enroll/([^/]+))", UnenrollUserHandler);

    // Questions API
    server.Get("/api/questions", GetQuestionsListHandler);
    server.Get(R"(/api/questions/([^/]+)/versions)", GetQuestionVersionsHandler);
    server.Get(R"(/api/questions/([^/]+))", GetQuestionHandler);
    server.Post("/api/questions", CreateQuestionHandler);
    server.Put(R"(/api/questions/([^/]+))", UpdateQuestionHandler);
    server.Delete(R"(/api/questions/([^/]+)/version)", DeleteQuestionVersionHandler);
    server.Delete(R"(/api/questions/([^/]+))", DeleteQuestionHandler);

    // Attempts API
    server.Get(R"(/api/attempts/([^/]+))", GetAttemptHandler);
    server.Post(R"(/api/attempts/([^/]+)/finish)", FinishAttemptHandler);
    server.Post(R"(/api/attempts/([^/]+)/answers)", CreateAnswerHandler);
    server.Put(R"(/api/attempts/([^/]+)/answers/([^/]+))", UpdateAnswerHandler);
    server.Delete(R"(/api/attempts/([^/]+)/answers/([^/]+))", DeleteAnswerHandler);
    server.Get(R"(/api/attempts/([^/]+)/answers)", GetAttemptAnswersHandler);

    // User attempt for test
    server.Get(R"(/api/tests/([^/]+)/user-attempt)", GetUserAttemptForTestHandler);

    // Test results API (по ТЗ: test:answer:read)
    server.Get(R"(/api/tests/([^/]+)/users)", GetTestUsersHandler);
    server.Get(R"(/api/tests/([^/]+)/grades)", GetTestGradesHandler);
    server.Get(R"(/api/tests/([^/]+)/answers)", GetTestAnswersHandler);

    // Answers API
    server.Get(R"(/api/answers/([^/]+))", GetAnswerHandler);
    
    // Обработчик несовпадающих запросов (должен быть в конце после всех маршрутов)
    server.set_error_handler(handle_unmatched_request);
    
    // Получаем порт из конфигурации или используем значение по умолчанию
    std::string port_str = config.get("server.port", "3002");
    int port = std::stoi(port_str);
    
    std::cout << "Server listening on http://0.0.0.0:" << port << std::endl;
    std::cout << "Press Ctrl+C to stop" << std::endl;
    
    server.listen("0.0.0.0", port);
    
    return 0;
}

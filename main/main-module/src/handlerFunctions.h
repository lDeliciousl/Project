#pragma once

#include <httplib.h>
#include "handlerRequest.h"

// Объявления функций (теперь они определены в handlerRequest.h)
void PostgresInit();
void handle_unmatched_request(const httplib::Request& req, httplib::Response& res);

// Перенаправляем на новые обработчики
#define AddUser AddUserHandler
#define GetUserList GetUserListHandler
#define GetUserNamea GetUserNameHandler
#define SetUserName SetUserNameHandler
#define GetUserCourses GetUserCoursesHandler
#define GetUserGrades GetUserGradesHandler
#define GetUserTests GetUserTestsHandler
#define GetUserRoles GetUserRolesHandler
#define SetUserRoles SetUserRolesHandler

cmake_minimum_required(VERSION 3.15)
project(main_module)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Для локальной разработки - ищем Crow
find_package(Crow QUIET)

if(NOT Crow_FOUND)
    message(STATUS "Crow not found, will use local installation")
    # В Docker будет использоваться vcpkg
endif()

# Ищем libpqxx
find_package(libpqxx REQUIRED)

# Список исходных файлов
set(SOURCES
    src/main.cpp
    src/server/simple_server.cpp
)

# Список заголовочных файлов
set(HEADERS
    include/utils/config.hpp
)

# Проверяем наличие Crow
if(Crow_FOUND)
    message(STATUS "Found Crow: ${Crow_DIR}")
    add_executable(${PROJECT_NAME} ${SOURCES} ${HEADERS})
    target_link_libraries(${PROJECT_NAME} PRIVATE Crow::Crow libpqxx::pqxx Threads::Threads)
else()
    message(STATUS "Crow not found, building without HTTP server")
    # Компилируем без Crow для теста
    add_executable(${PROJECT_NAME} src/main.cpp ${HEADERS})
    target_link_libraries(${PROJECT_NAME} PRIVATE libpqxx::pqxx Threads::Threads)
endif()

# Выходная директория
set_target_properties(${PROJECT_NAME} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

message(STATUS "========================================")
message(STATUS "Project: ${PROJECT_NAME}")
message(STATUS "Crow found: ${Crow_FOUND}")
message(STATUS "========================================")

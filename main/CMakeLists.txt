
cmake_minimum_required(VERSION 3.15)
project(main_module)

set(CMAKE_CXX_STANDARD 17)

# Ищем необходимые библиотеки
find_package(Threads REQUIRED)
find_package(libpqxx REQUIRED)
# Для jwt-cpp и HTTP-сервера могут понадобиться FetchContent или vcpkg

# Пример для crow (минималистичный HTTP-сервер)
include(FetchContent)
FetchContent_Declare(
  crow
  GIT_REPOSITORY https://github.com/CrowCpp/Crow.git
  GIT_TAG v1.0+5
)
FetchContent_MakeAvailable(crow)

add_executable(main_module src/main.cpp src/http_server.cpp ...)
target_link_libraries(main_module PRIVATE 
    Threads::Threads 
    libpqxx 
    crow::crow
    # jwt-cpp и другие
)

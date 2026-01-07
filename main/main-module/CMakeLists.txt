cmake_minimum_required(VERSION 3.15)
project(main_module VERSION 1.0.0)

# Настройки компилятора
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Пути для исходников
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_BINARY_DIR}
)

# Находим необходимые библиотеки
find_package(Threads REQUIRED)

# Собираем список исходных файлов
file(GLOB_RECURSE SOURCES 
    "src/*.cpp"
    "src/*/*.cpp"
)

file(GLOB_RECURSE HEADERS 
    "include/*.hpp"
    "include/*/*.hpp"
)

# Проверяем, что есть исходники
list(LENGTH SOURCES SOURCE_COUNT)
if(SOURCE_COUNT EQUAL 0)
    message(WARNING "No source files found in src/ directory")
    
    # Создаем минимальный набор исходников для первой сборки
    file(WRITE ${CMAKE_CURRENT_SOURCE_DIR}/src/main.cpp "int main() { return 0; }")
    list(APPEND SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/main.cpp)
endif()

# Создаем исполняемый файл
add_executable(${PROJECT_NAME} ${SOURCES} ${HEADERS})

# Связываем системные библиотеки
target_link_libraries(${PROJECT_NAME} PRIVATE Threads::Threads)

# Целевая директория для сборки
set_target_properties(${PROJECT_NAME} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

message(STATUS "========================================")
message(STATUS "Project: ${PROJECT_NAME}")
message(STATUS "Version: ${PROJECT_VERSION}")
message(STATUS "Source files: ${SOURCE_COUNT}")
message(STATUS "========================================")

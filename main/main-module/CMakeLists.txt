cmake_minimum_required(VERSION 3.10)
project(main_server)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

message(STATUS "Building main_server (JWT DISABLED - using stub)")

# Включите директории
include_directories(
    src
    src/lib/include
)

# Исходные файлы
add_executable(main_server
    src/main.cpp
    src/handlerRequest.cpp
    src/handlerFunctions.cpp  # Добавьте эту строку
    src/postgres.cpp
)

# Базовая конфигурация
target_link_libraries(main_server pthread)

# Для macOS
if(APPLE)
    # Попробуем найти libpq для базы данных
    find_library(PQ_LIB pq
        PATHS /opt/homebrew/opt/libpq/lib
              /usr/local/opt/libpq/lib
        NO_DEFAULT_PATH)
    
    if(PQ_LIB)
        message(STATUS "Found PostgreSQL library: ${PQ_LIB}")
        target_link_libraries(main_server ${PQ_LIB})
        
        # Добавим include директорию для libpq
        find_path(PQ_INCLUDE_DIR libpq-fe.h
            PATHS /opt/homebrew/opt/libpq/include
                  /usr/local/opt/libpq/include)
        if(PQ_INCLUDE_DIR)
            target_include_directories(main_server PRIVATE ${PQ_INCLUDE_DIR})
        endif()
    else()
        message(WARNING "PostgreSQL library not found. Database features disabled.")
    endif()
    
    # Отключаем предупреждения
    target_compile_options(main_server PRIVATE
        -Wno-deprecated-declarations
        -Wno-unused-variable
        -Wno-unused-function
    )
    
    # Пути для линковки
    target_link_options(main_server PRIVATE
        -L/opt/homebrew/lib
        -L/usr/local/lib
    )
endif()

# Флаги для всех платформ
target_compile_definitions(main_server PRIVATE
    -DJWT_STUB_MODE
)

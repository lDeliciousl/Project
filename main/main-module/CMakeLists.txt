cmake_minimum_required(VERSION 3.10)
project(main_server)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

message(STATUS "Building main_server (JWT DISABLED - using stub)")

# OpenSSL is required for HS256 JWT validation (HMAC-SHA256)
find_package(OpenSSL)

# Включите директории
include_directories(
    src
    src/lib/include
)

# ============================================================================
# ИСХОДНЫЕ ФАЙЛЫ (одинаковые для всех платформ)
# ============================================================================
add_executable(main_server
    src/main.cpp
    src/handlerRequest.cpp
    src/handlerFunctions.cpp
    # src/postgres.cpp - ПОКА НЕ ДОБАВЛЯЕМ, чтобы избежать ошибок на Windows
)

# ============================================================================
# КОНФИГУРАЦИЯ ДЛЯ macOS
# ============================================================================
if(APPLE)
    message(STATUS "Configuring for macOS")
    
    # Поиск PostgreSQL (предполагаем установку через Homebrew)
    find_library(PQ_LIB pq
        PATHS /opt/homebrew/opt/libpq/lib
              /usr/local/opt/libpq/lib
        NO_DEFAULT_PATH)
    
    # Если нашли PostgreSQL - подключаем его и добавляем postgres.cpp
    if(PQ_LIB)
        message(STATUS "Found PostgreSQL library: ${PQ_LIB}")
        
        # Добавляем postgres.cpp ТОЛЬКО если есть PostgreSQL
        target_sources(main_server PRIVATE src/postgres.cpp)
        
        # Подключаем библиотеку
        target_link_libraries(main_server ${PQ_LIB})
        
        # Ищем заголовочные файлы
        find_path(PQ_INCLUDE_DIR libpq-fe.h
            PATHS /opt/homebrew/opt/libpq/include
                  /usr/local/opt/libpq/include)
        
        if(PQ_INCLUDE_DIR)
            target_include_directories(main_server PRIVATE ${PQ_INCLUDE_DIR})
        endif()
        
        # Флаг что PostgreSQL доступен
        target_compile_definitions(main_server PRIVATE -DHAVE_POSTGRESQL)
    else()
        message(WARNING "PostgreSQL library not found on macOS. Database features disabled.")
    endif()
    
    # Настройки компиляции для macOS
    target_link_libraries(main_server pthread)

    if(OpenSSL_FOUND)
        target_link_libraries(main_server OpenSSL::Crypto)
    else()
        message(WARNING "OpenSSL not found on macOS. JWT validation may fail to link.")
    endif()
    target_compile_options(main_server PRIVATE
        -Wno-deprecated-declarations
        -Wno-unused-variable
        -Wno-unused-function
    )
    
# ============================================================================
# КОНФИГУРАЦИЯ ДЛЯ LINUX (Docker)
# ============================================================================
elseif(UNIX AND NOT APPLE)
    message(STATUS "Configuring for Linux")
    
    # Поиск PostgreSQL на Linux (стандартные пути)
    find_package(PostgreSQL)
    
    if(PostgreSQL_FOUND)
        message(STATUS "Found PostgreSQL library")
        
        # Добавляем postgres.cpp
        target_sources(main_server PRIVATE src/postgres.cpp)
        
        # Подключаем библиотеку
        target_link_libraries(main_server ${PostgreSQL_LIBRARIES})
        target_include_directories(main_server PRIVATE ${PostgreSQL_INCLUDE_DIRS})
        
        # Флаг что PostgreSQL доступен
        target_compile_definitions(main_server PRIVATE -DHAVE_POSTGRESQL)
    else()
        message(WARNING "PostgreSQL library not found on Linux. Database features disabled.")
    endif()
    
    # Настройки компиляции для Linux
    target_link_libraries(main_server pthread)

    if(OpenSSL_FOUND)
        target_link_libraries(main_server OpenSSL::Crypto)
    else()
        message(WARNING "OpenSSL not found on Linux. JWT validation may fail to link.")
    endif()
    target_compile_options(main_server PRIVATE
        -Wall
        -Wextra
        -Wno-unused-variable
        -Wno-unused-function
    )
    
# ============================================================================
# КОНФИГУРАЦИЯ ДЛЯ WINDOWS
# ============================================================================
elseif(WIN32)
    message(STATUS "Configuring for Windows")
    
    # НЕ добавляем postgres.cpp на Windows (пока используем заглушку)
    # target_sources(main_server PRIVATE src/postgres.cpp) - ЗАКОММЕНТИРОВАНО
    
    # Системные библиотеки Windows
    target_link_libraries(main_server ws2_32 advapi32)
    
    # Настройки компиляции для MSVC
    if(MSVC)
        target_compile_options(main_server PRIVATE
            /W4
            /EHsc
            /wd4100  # Неиспользуемый параметр
            /wd4996  # Небезопасные функции
        )
    endif()
    
    # Флаг заглушки для Windows
    target_compile_definitions(main_server PRIVATE -DNO_POSTGRESQL_WINDOWS)

    # OpenSSL on Windows is not wired here yet
    if(OpenSSL_FOUND)
        target_link_libraries(main_server OpenSSL::Crypto)
    endif()
endif()

# ============================================================================
# ОБЩИЕ НАСТРОЙКИ ДЛЯ ВСЕХ ПЛАТФОРМ
# ============================================================================
target_compile_definitions(main_server PRIVATE
    -DJWT_STUB_MODE
)

# Настройка свойств
set_target_properties(main_server PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
    CXX_EXTENSIONS OFF
)
# Этап 1: Сборка
FROM ubuntu:22.04 AS builder

# 1. Устанавливаем зависимости для сборки
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential \
    cmake \
    libpqxx-dev \
    libssl-dev \
    libboost-system-dev \
    libboost-thread-dev \
    postgresql-client \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*


# 2. Устанавливаем Crow
WORKDIR /tmp
RUN git clone https://github.com/CrowCpp/Crow.git && \
    cd Crow && \
    git checkout v1.0+5 && \
    mkdir build && cd build && \
    cmake .. -DCROW_BUILD_EXAMPLES=OFF -DCROW_BUILD_TESTS=OFF && \
    make && make install

# 3. Копируем исходный код
WORKDIR /app
COPY . .

# 4. Создаем CMakeLists.txt
RUN cat > CMakeLists.txt << 'CMAKE'
cmake_minimum_required(VERSION 3.15)
project(main_module)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Ищем библиотеки
find_package(Crow REQUIRED)
find_package(libpqxx REQUIRED)
find_package(Boost REQUIRED COMPONENTS system thread)

# Исходные файлы
file(GLOB_RECURSE SOURCES "src/*.cpp")
file(GLOB_RECURSE HEADERS "include/*.hpp")

# Исполняемый файл
add_executable(${PROJECT_NAME} ${SOURCES} ${HEADERS})

# Подключаем библиотеки
target_link_libraries(${PROJECT_NAME} PRIVATE 
    Crow::Crow
    libpqxx::pqxx
    Boost::system
    Boost::thread
    ssl
    crypto
)

# Выходная директория
set_target_properties(${PROJECT_NAME} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}
)
CMAKE

# 5. Собираем проект
RUN mkdir -p build && cd build && \
    cmake .. && \
    make -j$(nproc)

# Этап 2: Запуск
FROM ubuntu:22.04

# Runtime зависимости - ИСПРАВЛЕННЫЕ ИМЕНА ПАКЕТОВ!
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    libpqxx-6.1 \
    libssl3 \
    libboost-system1.74.0 \
    libboost-thread1.74.0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Создаем пользователя
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app && \
    chown -R appuser:appuser /app

USER appuser
WORKDIR /app

# Копируем бинарник
COPY --from=builder /app/build/main_module .

EXPOSE 3002

# Запускаем
CMD ["./main_module"]

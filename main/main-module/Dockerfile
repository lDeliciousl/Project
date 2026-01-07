# Этап 1: Сборка
FROM ubuntu:22.04 AS builder

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    pkg-config \
    libpqxx-dev \
    libssl-dev \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем Crow (HTTP сервер для C++)
RUN wget https://github.com/CrowCpp/Crow/archive/refs/tags/v1.0+5.tar.gz -O crow.tar.gz && \
    tar -xzf crow.tar.gz && \
    cd Crow-1.0+5 && \
    mkdir build && cd build && \
    cmake .. -DCROW_BUILD_EXAMPLES=OFF -DCROW_BUILD_TESTS=OFF && \
    make install && \
    cd / && rm -rf crow.tar.gz Crow-1.0+5

# Копируем исходный код
WORKDIR /app
COPY . .

# Создаем директорию для сборки и собираем
RUN mkdir -p build && \
    cd build && \
    cmake .. && \
    make -j$(nproc)

# Этап 2: Запуск
FROM ubuntu:22.04

# Устанавливаем runtime зависимости
RUN apt-get update && apt-get install -y \
    libstdc++6 \
    libpqxx-6.1 \
    libssl3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Создаём пользователя для безопасности
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app && \
    chown -R appuser:appuser /app

USER appuser

# Копируем собранное приложение
WORKDIR /app
COPY --from=builder /app/build/bin/main_module .

# Открываем порт
EXPOSE 3002

# Запускаем приложение
CMD ["./main_module"]

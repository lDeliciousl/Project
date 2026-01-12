# Этап 1: Сборка
FROM ubuntu:22.04 AS builder

# Устанавливаем зависимости для сборки
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential \
    cmake \
    libpq-dev \
    libssl-dev \
    postgresql-client \
    nlohmann-json3-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Копируем исходный код
WORKDIR /app
COPY . .

# Собираем проект, всегда начиная с чистой папки build
RUN rm -rf build && mkdir -p build && cd build && \
    cmake .. && \
    make -j$(nproc)

# Этап 2: Запуск
FROM ubuntu:22.04

# Runtime зависимости
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    libpq5 \
    libssl3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Создаем пользователя
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app && \
    chown -R appuser:appuser /app

USER appuser
WORKDIR /app

# Копируем бинарник
COPY --from=builder /app/build/main_server .

EXPOSE 3002

# Запускаем
CMD ["./main_server"]

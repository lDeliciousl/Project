FROM postgres:15-alpine

# Копируем SQL скрипт инициализации
COPY init.sql /docker-entrypoint-initdb.d/

# Настраиваем здоровье
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD pg_isready -U main_module -d testing_system

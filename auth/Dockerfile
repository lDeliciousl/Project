# Используем официальный образ Go
FROM golang:1.21-alpine

# Устанавливаем рабочий каталог
WORKDIR /app

# Копируем файлы зависимостей
COPY go.mod go.sum ./

# Скачиваем зависимости
RUN go mod download

# Копируем исходный код
COPY . .

# Собираем приложение
RUN go build -o main .

# Открываем порт
EXPOSE 3001

# Запускаем приложение
CMD ["./main"]
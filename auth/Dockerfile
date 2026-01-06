FROM golang:1.21-alpine

WORKDIR /app

# Копируем всё
COPY . .

# Собираем ПАКЕТ, а не файл
RUN go build -o app ./cmd

EXPOSE 8081
CMD ["./app"]
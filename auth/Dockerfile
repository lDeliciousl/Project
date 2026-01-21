# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# 1. Копируем файлы зависимостей
COPY go.mod go.sum ./



# 2. Скачиваем зависимости
ENV GOPROXY=https://goproxy.io,https://goproxy.cn,direct
ENV GOSUMDB=off
RUN go mod download

# 3. Копируем исходный код
COPY . .

# 4. Проверяем что main.go существует
RUN test -f main.go || (echo " main.go not found!" && ls -la && exit 1)

# 5. Собираем бинарник
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# 6. Проверяем что бинарник создался
RUN test -f main || (echo " Binary not built!" && exit 1)

# Runtime stage
FROM alpine:latest

WORKDIR /app

# 7. Копируем бинарник из builder stage
COPY --from=builder /app/main .

# 8. Запускаем БИНАРНИК, а не go run
CMD ["./main"]
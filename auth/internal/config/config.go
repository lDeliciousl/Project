package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config - основная структура конфигурации
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	JWT      JWTConfig
	OAuth    OAuthConfig
	Cors     CorsConfig
	Logging  LoggingConfig
}

// ServerConfig - настройки сервера
type ServerConfig struct {
	Host         string
	Port         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

// DatabaseConfig - настройки базы данных
type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

// RedisConfig - настройки Redis
type RedisConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
}

// JWTConfig - настройки JWT токенов
type JWTConfig struct {
	AccessTokenSecret  string
	RefreshTokenSecret string
	AccessTokenExpiry  time.Duration
	RefreshTokenExpiry time.Duration
}

// OAuthConfig - настройки OAuth провайдеров
type OAuthConfig struct {
	GitHub GitHubConfig
	Yandex YandexConfig
}

type GitHubConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

type YandexConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

// CorsConfig - настройки CORS
type CorsConfig struct {
	AllowedOrigins []string
	AllowedMethods []string
	AllowedHeaders []string
}

// LoggingConfig - настройки логирования
type LoggingConfig struct {
	Level  string
	Format string
}

// AppConfig - глобальная переменная конфигурации
var AppConfig *Config

// Load - загрузка конфигурации из .env файла
func Load() error {
	// Пытаемся загрузить .env файл, но это не обязательно
	_ = godotenv.Load()

	AppConfig = &Config{
		Server: ServerConfig{
			Host:         getEnv("SERVER_HOST", "0.0.0.0"),
			Port:         getEnv("SERVER_PORT", "8081"),
			ReadTimeout:  getEnvAsDuration("SERVER_READ_TIMEOUT", 10*time.Second),
			WriteTimeout: getEnvAsDuration("SERVER_WRITE_TIMEOUT", 10*time.Second),
			IdleTimeout:  getEnvAsDuration("SERVER_IDLE_TIMEOUT", 60*time.Second),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "27017"),
			User:     getEnv("DB_USER", ""),
			Password: getEnv("DB_PASSWORD", ""),
			Name:     getEnv("DB_NAME", "auth_db"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvAsInt("REDIS_DB", 0),
		},
		JWT: JWTConfig{
			AccessTokenSecret:  getEnv("JWT_ACCESS_SECRET", "your-access-secret-key-change-in-production"),
			RefreshTokenSecret: getEnv("JWT_REFRESH_SECRET", "your-refresh-secret-key-change-in-production"),
			AccessTokenExpiry:  getEnvAsDuration("JWT_ACCESS_EXPIRY", 1*time.Minute),
			RefreshTokenExpiry: getEnvAsDuration("JWT_REFRESH_EXPIRY", 168*time.Hour), // 7 дней
		},
		OAuth: OAuthConfig{
			GitHub: GitHubConfig{
				ClientID:     getEnv("GITHUB_CLIENT_ID", ""),
				ClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
				RedirectURL:  getEnv("GITHUB_REDIRECT_URL", "http://localhost:8081/auth/github/callback"),
			},
			Yandex: YandexConfig{
				ClientID:     getEnv("YANDEX_CLIENT_ID", ""),
				ClientSecret: getEnv("YANDEX_CLIENT_SECRET", ""),
				RedirectURL:  getEnv("YANDEX_REDIRECT_URL", "http://localhost:8081/auth/yandex/callback"),
			},
		},
		Cors: CorsConfig{
			AllowedOrigins: getEnvAsSlice("CORS_ALLOWED_ORIGINS", []string{"*"}, ","),
			AllowedMethods: getEnvAsSlice("CORS_ALLOWED_METHODS", []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}, ","),
			AllowedHeaders: getEnvAsSlice("CORS_ALLOWED_HEADERS", []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"}, ","),
		},
		Logging: LoggingConfig{
			Level:  getEnv("LOG_LEVEL", "info"),
			Format: getEnv("LOG_FORMAT", "json"),
		},
	}

	return nil
}

// Вспомогательные функции для работы с переменными окружения

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return defaultValue
}

func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	valueStr := getEnv(key, "")
	if value, err := time.ParseDuration(valueStr); err == nil {
		return value
	}
	return defaultValue
}

func getEnvAsSlice(key string, defaultValue []string, separator string) []string {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return defaultValue
	}
	return strings.Split(valueStr, separator)
}

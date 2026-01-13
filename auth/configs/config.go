package configs

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config хранит все настройки приложения
type Config struct {
	Server      ServerConfig
	Database    DatabaseConfig
	Redis       RedisConfig
	JWT         JWTConfig
	OAuth       OAuthConfig
	WebClientURL string
}

type ServerConfig struct {
	Port         string
	Host         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

type DatabaseConfig struct {
	URI     string        `json:"uri"`
	Name    string        `json:"name"`
	Timeout time.Duration `json:"timeout"`
}

type RedisConfig struct {
	URL      string `json:"url"`
	Password string `json:"password"`
	Addr     string `json:"addr"`
	DB       int    `json:"db"`
}

type JWTConfig struct {
	AccessSecret  string
	RefreshSecret string
	AccessExpiry  time.Duration
	RefreshExpiry time.Duration
}

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

var AppConfig *Config

// Load загружает конфигурацию из .env файла
func Load() error {
	// Загружаем .env файл если он существует
	_ = godotenv.Load()

	AppConfig = &Config{
		Server: ServerConfig{
			Port:         getEnv("PORT", "8001"),
			Host:         getEnv("HOST", "0.0.0.0"),
			ReadTimeout:  getEnvAsDuration("READ_TIMEOUT", 10*time.Second),
			WriteTimeout: getEnvAsDuration("WRITE_TIMEOUT", 10*time.Second),
		},
		Database: DatabaseConfig{
			URI:     getEnv("MONGODB_URI", "mongodb://mongo:27017/auth_db"),
			Name:    getEnv("MONGODB_NAME", "auth"),
			Timeout: getEnvAsDuration("MONGODB_TIMEOUT", 10*time.Second),
		},
		Redis: RedisConfig{
			URL:      getEnv("REDIS_URL", "redis://localhost:6379/0"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvAsInt("REDIS_DB", 0),
		},
		JWT: JWTConfig{
			AccessSecret:  getEnv("JWT_ACCESS_SECRET", "default-access-secret-change-me"),
			RefreshSecret: getEnv("JWT_REFRESH_SECRET", "default-refresh-secret-change-me"),
			AccessExpiry:  getEnvAsDuration("JWT_ACCESS_EXPIRY", 1*time.Minute), // По ТЗ: 1 минута
			RefreshExpiry: getEnvAsDuration("JWT_REFRESH_EXPIRY", 7*24*time.Hour),
		},
		OAuth: OAuthConfig{
			GitHub: GitHubConfig{
				ClientID:     getEnv("GITHUB_CLIENT_ID", ""),
				ClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
				RedirectURL:  getEnv("GITHUB_REDIRECT_URL", "http://localhost:8001/api/auth/github/callback"),
			},
			Yandex: YandexConfig{
				ClientID:     getEnv("YANDEX_CLIENT_ID", ""),
				ClientSecret: getEnv("YANDEX_CLIENT_SECRET", ""),
				RedirectURL:  getEnv("YANDEX_REDIRECT_URL", "http://localhost:8001/api/auth/yandex/callback"),
			},
		},
		WebClientURL: getEnv("WEB_CLIENT_URL", "http://localhost:8000"),
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

// GetServerAddress возвращает адрес сервера для прослушивания
func (c *Config) GetServerAddress() string {
	return fmt.Sprintf("%s:%s", c.Server.Host, c.Server.Port)
}

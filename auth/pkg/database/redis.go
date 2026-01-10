package database

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/configs"
)

// RedisClient глобальная переменная для подключения к Redis
var (
	RedisClient    *redis.Client
	redisOnce      sync.Once
	redisInitError error
)

// InitRedis инициализирует подключение к Redis
func InitRedis() error {
	redisOnce.Do(func() {
		cfg := configs.AppConfig.Redis

		// Парсим URL Redis
		opts, err := redis.ParseURL(cfg.URL)
		if err != nil {
			// Если URL невалидный, создаем опции вручную
			opts = &redis.Options{
				Addr:     "localhost:6379",
				Password: "",
				DB:       0,
			}

			if cfg.URL != "" {
				log.Printf("Warning: invalid Redis URL, using default: %v", err)
			}
		}

		// Переопределяем настройки из конфига
		if cfg.Password != "" {
			opts.Password = cfg.Password
		}
		if cfg.Addr != "" {
			opts.Addr = cfg.Addr
		}
		if cfg.DB > 0 {
			opts.DB = cfg.DB
		}

		// Настройки подключения
		opts.PoolSize = 100
		opts.MinIdleConns = 10
		opts.PoolTimeout = 30 * time.Second
		opts.IdleTimeout = 5 * time.Minute
		opts.MaxConnAge = 30 * time.Minute

		log.Printf("Connecting to Redis: %s, DB: %d", opts.Addr, opts.DB)

		// Создаем клиент Redis
		client := redis.NewClient(opts)

		// Проверяем подключение
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := client.Ping(ctx).Err(); err != nil {
			redisInitError = fmt.Errorf("failed to connect to Redis: %w", err)
			return
		}

		// Сохраняем подключение
		RedisClient = client

		log.Println("✅ Successfully connected to Redis")
	})

	return redisInitError
}

// GetRedisClient возвращает клиент Redis
func GetRedisClient() *redis.Client {
	if RedisClient == nil {
		if err := InitRedis(); err != nil {
			log.Fatalf("Failed to initialize Redis: %v", err)
		}
	}
	return RedisClient
}

// CloseRedis закрывает подключение к Redis
func CloseRedis() {
	if RedisClient != nil {
		if err := RedisClient.Close(); err != nil {
			log.Printf("Failed to close Redis connection: %v", err)
		} else {
			log.Println("Disconnected from Redis")
		}
	}
}

// RedisHealthCheck проверяет доступность Redis
func RedisHealthCheck() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if RedisClient == nil {
		return fmt.Errorf("Redis client is not initialized")
	}

	return RedisClient.Ping(ctx).Err()
}

// RedisCache интерфейс для работы с кэшем
type RedisCache struct {
	client *redis.Client
	prefix string
}

// NewRedisCache создает новый кэш
func NewRedisCache(prefix string) *RedisCache {
	return &RedisCache{
		client: GetRedisClient(),
		prefix: prefix,
	}
}

// Set сохраняет значение в Redis
func (rc *RedisCache) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	fullKey := rc.prefix + ":" + key
	return rc.client.Set(ctx, fullKey, value, expiration).Err()
}

// Get получает значение из Redis
func (rc *RedisCache) Get(ctx context.Context, key string) (string, error) {
	fullKey := rc.prefix + ":" + key
	return rc.client.Get(ctx, fullKey).Result()
}

// Delete удаляет ключ из Redis
func (rc *RedisCache) Delete(ctx context.Context, key string) error {
	fullKey := rc.prefix + ":" + key
	return rc.client.Del(ctx, fullKey).Err()
}

// Exists проверяет существование ключа
func (rc *RedisCache) Exists(ctx context.Context, key string) (bool, error) {
	fullKey := rc.prefix + ":" + key
	result, err := rc.client.Exists(ctx, fullKey).Result()
	return result > 0, err
}

// Increment увеличивает значение на 1
func (rc *RedisCache) Increment(ctx context.Context, key string) (int64, error) {
	fullKey := rc.prefix + ":" + key
	return rc.client.Incr(ctx, fullKey).Result()
}

// SetNX устанавливает значение только если ключ не существует
func (rc *RedisCache) SetNX(ctx context.Context, key string, value interface{}, expiration time.Duration) (bool, error) {
	fullKey := rc.prefix + ":" + key
	return rc.client.SetNX(ctx, fullKey, value, expiration).Result()
}

// HSet сохраняет значение в hash
func (rc *RedisCache) HSet(ctx context.Context, key, field string, value interface{}) error {
	fullKey := rc.prefix + ":" + key
	return rc.client.HSet(ctx, fullKey, field, value).Err()
}

// HGet получает значение из hash
func (rc *RedisCache) HGet(ctx context.Context, key, field string) (string, error) {
	fullKey := rc.prefix + ":" + key
	return rc.client.HGet(ctx, fullKey, field).Result()
}

// HGetAll получает все поля hash
func (rc *RedisCache) HGetAll(ctx context.Context, key string) (map[string]string, error) {
	fullKey := rc.prefix + ":" + key
	return rc.client.HGetAll(ctx, fullKey).Result()
}

// LPush добавляет элемент в список
func (rc *RedisCache) LPush(ctx context.Context, key string, values ...interface{}) error {
	fullKey := rc.prefix + ":" + key
	return rc.client.LPush(ctx, fullKey, values...).Err()
}

// RPop удаляет и возвращает последний элемент списка
func (rc *RedisCache) RPop(ctx context.Context, key string) (string, error) {
	fullKey := rc.prefix + ":" + key
	return rc.client.RPop(ctx, fullKey).Result()
}

// Publish публикует сообщение в канал
func (rc *RedisCache) Publish(ctx context.Context, channel string, message interface{}) error {
	return rc.client.Publish(ctx, channel, message).Err()
}

// Subscribe подписывается на канал
func (rc *RedisCache) Subscribe(ctx context.Context, channels ...string) *redis.PubSub {
	return rc.client.Subscribe(ctx, channels...)
}

// Pipeline выполняет несколько команд в пайплайне
func (rc *RedisCache) Pipeline(ctx context.Context, fn func(pipe redis.Pipeliner) error) error {
	_, err := rc.client.Pipelined(ctx, fn)
	return err
}

// Transaction выполняет несколько команд в транзакции
func (rc *RedisCache) Transaction(ctx context.Context, fn func(pipe redis.Pipeliner) error) error {
	_, err := rc.client.TxPipelined(ctx, fn)
	return err
}

// Keys возвращает все ключи по паттерну
func (rc *RedisCache) Keys(ctx context.Context, pattern string) ([]string, error) {
	fullPattern := rc.prefix + ":" + pattern
	return rc.client.Keys(ctx, fullPattern).Result()
}

// FlushDB очищает текущую базу данных
func (rc *RedisCache) FlushDB(ctx context.Context) error {
	return rc.client.FlushDB(ctx).Err()
}

// Close закрывает соединение
func (rc *RedisCache) Close() error {
	return rc.client.Close()
}

// RateLimiter для ограничения запросов
type RateLimiter struct {
	cache *RedisCache
}

// NewRateLimiter создает новый rate limiter
func NewRateLimiter() *RateLimiter {
	return &RateLimiter{
		cache: NewRedisCache("rate_limit"),
	}
}

// Allow проверяет, разрешен ли запрос
func (rl *RateLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	now := time.Now().UnixNano()
	windowMicro := window.Microseconds()

	// Используем транзакцию для атомарности
	_, err := rl.cache.client.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		// Удаляем старые запросы
		pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", now-windowMicro))

		// Считаем количество запросов в окне
		pipe.ZCard(ctx, key)

		// Добавляем текущий запрос
		pipe.ZAdd(ctx, key, &redis.Z{
			Score:  float64(now),
			Member: now,
		})

		// Устанавливаем TTL для ключа
		pipe.Expire(ctx, key, window)

		return nil
	})

	if err != nil {
		return false, err
	}

	// Получаем количество запросов
	count, err := rl.cache.client.ZCard(ctx, key).Result()
	if err != nil {
		return false, err
	}

	return count <= int64(limit), nil
}

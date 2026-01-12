package database

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/configs"
)

// MongoClient глобальная переменная для подключения к MongoDB
var (
	MongoClient    *mongo.Client
	MongoDB        *mongo.Database
	mongoOnce      sync.Once
	mongoInitError error
)

// InitMongoDB инициализирует подключение к MongoDB
func InitMongoDB() error {
	mongoOnce.Do(func() {
		cfg := configs.AppConfig.Database

		// Формируем строку подключения
		uri := cfg.URI
		if uri == "" {
			uri = "mongodb://localhost:27017/auth_db"
		}

		log.Printf("Connecting to MongoDB: %s", uri)

		// Настройки клиента
		clientOptions := options.Client().
			ApplyURI(uri).
			SetConnectTimeout(10 * time.Second).
			SetServerSelectionTimeout(10 * time.Second).
			SetMaxPoolSize(100).
			SetMinPoolSize(5).
			SetMaxConnIdleTime(30 * time.Second)

		// Подключаемся к MongoDB
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		client, err := mongo.Connect(ctx, clientOptions)
		if err != nil {
			mongoInitError = fmt.Errorf("failed to connect to MongoDB: %w", err)
			return
		}

		// Проверяем подключение
		ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err = client.Ping(ctx, readpref.Primary()); err != nil {
			mongoInitError = fmt.Errorf("failed to ping MongoDB: %w", err)
			return
		}

		// Сохраняем подключение
		MongoClient = client
		MongoDB = client.Database(cfg.Name)

		log.Printf("✅ Successfully connected to MongoDB database: %s", cfg.Name)
	})

	return mongoInitError
}

// GetMongoClient возвращает клиент MongoDB
func GetMongoClient() *mongo.Client {
	if MongoClient == nil {
		if err := InitMongoDB(); err != nil {
			log.Fatalf("Failed to initialize MongoDB: %v", err)
		}
	}
	return MongoClient
}

// GetMongoDB возвращает базу данных
func GetMongoDB() *mongo.Database {
	if MongoDB == nil {
		if err := InitMongoDB(); err != nil {
			log.Fatalf("Failed to initialize MongoDB: %v", err)
		}
	}
	return MongoDB
}

// GetCollection возвращает коллекцию по имени
func GetCollection(name string) *mongo.Collection {
	return GetMongoDB().Collection(name)
}

// CloseMongoDB закрывает подключение к MongoDB
func CloseMongoDB() {
	if MongoClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := MongoClient.Disconnect(ctx); err != nil {
			log.Printf("Failed to disconnect from MongoDB: %v", err)
		} else {
			log.Println("Disconnected from MongoDB")
		}
	}
}

// CreateIndexes создает необходимые индексы
func CreateIndexes() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Индексы для коллекции users
	users := GetCollection("users")

	userIndexes := []mongo.IndexModel{
		{
			Keys:    map[string]interface{}{"email": 1},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys:    map[string]interface{}{"provider": 1, "provider_id": 1},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys:    map[string]interface{}{"refresh_tokens.expires_at": 1},
			Options: options.Index().SetExpireAfterSeconds(0), // TTL индекс
		},
		{
			Keys: map[string]interface{}{"created_at": -1},
		},
	}

	_, err := users.Indexes().CreateMany(ctx, userIndexes)
	if err != nil {
		return fmt.Errorf("failed to create user indexes: %w", err)
	}

	// Индексы для коллекции login_sessions
	sessions := GetCollection("login_sessions")

	sessionIndexes := []mongo.IndexModel{
		{
			Keys:    map[string]interface{}{"login_token": 1},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys:    map[string]interface{}{"expires_at": 1},
			Options: options.Index().SetExpireAfterSeconds(0), // TTL индекс (15 минут)
		},
		{
			Keys: map[string]interface{}{"status": 1},
		},
		{
			Keys: map[string]interface{}{"user_id": 1},
		},
	}

	_, err = sessions.Indexes().CreateMany(ctx, sessionIndexes)
	if err != nil {
		return fmt.Errorf("failed to create session indexes: %w", err)
	}

	log.Println("✅ Database indexes created successfully")
	return nil
}

// HealthCheck проверяет доступность MongoDB
func MongoHealthCheck() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if MongoClient == nil {
		return fmt.Errorf("MongoDB client is not initialized")
	}

	return MongoClient.Ping(ctx, readpref.Primary())
}

// Transaction выполняет операции в транзакции
func Transaction(ctx context.Context, fn func(sessCtx mongo.SessionContext) error) error {
	client := GetMongoClient()

	session, err := client.StartSession()
	if err != nil {
		return fmt.Errorf("failed to start session: %w", err)
	}
	defer session.EndSession(ctx)

	return mongo.WithSession(ctx, session, func(sessCtx mongo.SessionContext) error {
		if err := session.StartTransaction(); err != nil {
			return fmt.Errorf("failed to start transaction: %w", err)
		}

		if err := fn(sessCtx); err != nil {
			// Откатываем транзакцию при ошибке
			if rbErr := session.AbortTransaction(sessCtx); rbErr != nil {
				return fmt.Errorf("abort error: %v, original error: %w", rbErr, err)
			}
			return err
		}

		return session.CommitTransaction(sessCtx)
	})
}

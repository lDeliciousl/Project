package repository

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/models"
)

// UserRepository интерфейс для работы с пользователями
type UserRepository interface {
	// Основные операции
	Create(ctx context.Context, user *models.User) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByProvider(ctx context.Context, provider, providerID string) (*models.User, error)
	GetAll(ctx context.Context) ([]*models.User, error)
	Update(ctx context.Context, id primitive.ObjectID, update bson.M) error
	Delete(ctx context.Context, id primitive.ObjectID) error
	UpsertByProvider(ctx context.Context, provider, providerID string, user *models.User) (*models.User, error)

	// Работа с refresh токенами
	AddRefreshToken(ctx context.Context, userID primitive.ObjectID, token models.RefreshToken) error
	RemoveRefreshToken(ctx context.Context, userID primitive.ObjectID, token string) error
	FindByRefreshToken(ctx context.Context, token string) (*models.User, error)
	CleanupExpiredRefreshTokens(ctx context.Context) error

	// Поиск и фильтрация
	FindAll(ctx context.Context, filter bson.M, opts ...*options.FindOptions) ([]*models.User, error)
	Count(ctx context.Context, filter bson.M) (int64, error)

	// Агрегации
	GetUserStats(ctx context.Context) (bson.M, error)

	// Блокировка/разблокировка
	BlockUser(ctx context.Context, userID primitive.ObjectID, reason string) error
	UnblockUser(ctx context.Context, userID primitive.ObjectID) error

	// Управление ролями
	UpdateRoles(ctx context.Context, userID primitive.ObjectID, roles []string) error
	GetUserByID(ctx context.Context, userID string) (*models.User, error)
}

// userRepository реализация UserRepository
type userRepository struct {
	collection *mongo.Collection
}

// NewUserRepository создает новый репозиторий пользователей
func NewUserRepository(db *mongo.Database) UserRepository {
	collection := db.Collection("users")

	// Создаем индексы при инициализации
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	createIndexes(ctx, collection)

	return &userRepository{
		collection: collection,
	}
}

// createIndexes создает индексы для коллекции пользователей
func createIndexes(ctx context.Context, collection *mongo.Collection) {
	indexes := []mongo.IndexModel{
		// Уникальный индекс на email
		{
			Keys:    bson.D{{Key: "email", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		// Уникальный индекс на комбинацию provider + provider_id
		{
			Keys:    bson.D{{Key: "provider", Value: 1}, {Key: "provider_id", Value: 1}},
			Options: options.Index().SetUnique(true).SetSparse(true), // sparse: только для документов с этими полями
		},
		// Индекс на created_at для сортировки
		{
			Keys: bson.D{{Key: "created_at", Value: -1}},
		},
		// Индекс на updated_at
		{
			Keys: bson.D{{Key: "updated_at", Value: -1}},
		},
		// Индекс на is_active для фильтрации
		{
			Keys: bson.D{{Key: "is_active", Value: 1}},
		},
		// TTL индекс для автоматического удаления просроченных refresh токенов
		{
			Keys:    bson.D{{Key: "refresh_tokens.expires_at", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(0),
		},
		// Текстовый индекс для поиска по имени и email
		{
			Keys: bson.D{
				{Key: "name", Value: "text"},
				{Key: "email", Value: "text"},
			},
		},
	}

	// Создаем индексы
	_, err := collection.Indexes().CreateMany(ctx, indexes)
	if err != nil {
		fmt.Printf("Warning: failed to create indexes: %v\n", err)
	}
}

// Create создает нового пользователя
func (r *userRepository) Create(ctx context.Context, user *models.User) error {
	// Устанавливаем временные метки
	now := time.Now()
	user.CreatedAt = now
	user.UpdatedAt = now

	// Устанавливаем значения по умолчанию
	if user.Roles == nil {
		user.Roles = []string{"Студент"}
	}
	if !user.IsActive {
		user.IsActive = true
	}

	// Вставляем документ
	result, err := r.collection.InsertOne(ctx, user)
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	// Получаем сгенерированный ID
	if oid, ok := result.InsertedID.(primitive.ObjectID); ok {
		user.ID = oid
	}

	return nil
}

// FindByID находит пользователя по ID
func (r *userRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error) {
	var user models.User

	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil // Пользователь не найден
		}
		return nil, fmt.Errorf("failed to find user by ID: %w", err)
	}

	return &user, nil
}

// FindByEmail находит пользователя по email
func (r *userRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User

	err := r.collection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find user by email: %w", err)
	}

	return &user, nil
}

// FindByProvider находит пользователя по провайдеру и ID провайдера
func (r *userRepository) FindByProvider(ctx context.Context, provider, providerID string) (*models.User, error) {
	var user models.User

	err := r.collection.FindOne(ctx, bson.M{
		"provider":    provider,
		"provider_id": providerID,
	}).Decode(&user)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find user by provider: %w", err)
	}

	return &user, nil
}

// Update обновляет пользователя
func (r *userRepository) Update(ctx context.Context, id primitive.ObjectID, update bson.M) error {
	// Добавляем updated_at в обновление
	if update["$set"] == nil {
		update["$set"] = bson.M{}
	}
	update["$set"].(bson.M)["updated_at"] = time.Now()

	result, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": id},
		update,
	)

	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("user not found with ID: %s", id.Hex())
	}

	return nil
}

// Delete удаляет пользователя
func (r *userRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	result, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("user not found with ID: %s", id.Hex())
	}

	return nil
}

// AddRefreshToken добавляет refresh токен пользователю (ВАШ КОД)
func (r *userRepository) AddRefreshToken(ctx context.Context, userID primitive.ObjectID, token models.RefreshToken) error {
	// Устанавливаем время создания токена, если не установлено
	if token.CreatedAt.IsZero() {
		token.CreatedAt = time.Now()
	}

	// Устанавливаем время истечения, если не установлено (по умолчанию 7 дней)
	if token.ExpiresAt.IsZero() {
		token.ExpiresAt = time.Now().Add(7 * 24 * time.Hour)
	}

	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": userID},
		bson.M{
			"$push": bson.M{
				"refresh_tokens": token,
			},
			"$set": bson.M{
				"updated_at": time.Now(),
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to add refresh token: %w", err)
	}

	return nil
}

// RemoveRefreshToken удаляет refresh токен у пользователя
func (r *userRepository) RemoveRefreshToken(ctx context.Context, userID primitive.ObjectID, token string) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": userID},
		bson.M{
			"$pull": bson.M{
				"refresh_tokens": bson.M{
					"token": token,
				},
			},
			"$set": bson.M{
				"updated_at": time.Now(),
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to remove refresh token: %w", err)
	}

	return nil
}

// FindByRefreshToken находит пользователя по refresh токену
func (r *userRepository) FindByRefreshToken(ctx context.Context, token string) (*models.User, error) {
	var user models.User

	err := r.collection.FindOne(ctx, bson.M{
		"refresh_tokens.token": token,
	}).Decode(&user)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to find user by refresh token: %w", err)
	}

	return &user, nil
}

// CleanupExpiredRefreshTokens очищает просроченные refresh токены
func (r *userRepository) CleanupExpiredRefreshTokens(ctx context.Context) error {
	now := time.Now()

	// Обновляем документы, удаляя просроченные токены
	_, err := r.collection.UpdateMany(
		ctx,
		bson.M{}, // Все документы
		bson.M{
			"$pull": bson.M{
				"refresh_tokens": bson.M{
					"expires_at": bson.M{"$lt": now},
				},
			},
			"$set": bson.M{
				"updated_at": now,
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to cleanup expired refresh tokens: %w", err)
	}

	return nil
}

// FindAll находит всех пользователей по фильтру
func (r *userRepository) FindAll(ctx context.Context, filter bson.M, opts ...*options.FindOptions) ([]*models.User, error) {
	cursor, err := r.collection.Find(ctx, filter, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to find users: %w", err)
	}
	defer cursor.Close(ctx)

	var users []*models.User
	for cursor.Next(ctx) {
		var user models.User
		if err := cursor.Decode(&user); err != nil {
			return nil, fmt.Errorf("failed to decode user: %w", err)
		}
		users = append(users, &user)
	}

	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("cursor error: %w", err)
	}

	return users, nil
}

// Count подсчитывает количество пользователей по фильтру
func (r *userRepository) Count(ctx context.Context, filter bson.M) (int64, error) {
	count, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return 0, fmt.Errorf("failed to count users: %w", err)
	}

	return count, nil
}

// GetUserStats возвращает статистику по пользователям
func (r *userRepository) GetUserStats(ctx context.Context) (bson.M, error) {
	pipeline := bson.A{
		// Группировка по провайдеру
		bson.M{
			"$group": bson.M{
				"_id":   "$provider",
				"count": bson.M{"$sum": 1},
				"active": bson.M{
					"$sum": bson.M{
						"$cond": bson.A{bson.M{"$eq": bson.A{"$is_active", true}}, 1, 0},
					},
				},
			},
		},
		// Преобразование в удобный формат
		bson.M{
			"$group": bson.M{
				"_id": nil,
				"providers": bson.M{
					"$push": bson.M{
						"name":   "$_id",
						"total":  "$count",
						"active": "$active",
					},
				},
				"total":        bson.M{"$sum": "$count"},
				"total_active": bson.M{"$sum": "$active"},
			},
		},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, fmt.Errorf("failed to aggregate user stats: %w", err)
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		return nil, fmt.Errorf("failed to decode stats: %w", err)
	}

	if len(results) == 0 {
		return bson.M{
			"total":        0,
			"total_active": 0,
			"providers":    bson.A{},
		}, nil
	}

	return results[0], nil
}

// BlockUser блокирует пользователя
func (r *userRepository) BlockUser(ctx context.Context, userID primitive.ObjectID, reason string) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": userID},
		bson.M{
			"$set": bson.M{
				"blocked":    true,
				"updated_at": time.Now(),
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to block user: %w", err)
	}

	_ = reason // reason можно использовать для логирования, но не сохраняем в БД
	return nil
}

// UnblockUser разблокирует пользователя
func (r *userRepository) UnblockUser(ctx context.Context, userID primitive.ObjectID) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": userID},
		bson.M{
			"$set": bson.M{
				"blocked":    false,
				"updated_at": time.Now(),
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to unblock user: %w", err)
	}

	return nil
}

// UpsertByProvider создает или обновляет пользователя по провайдеру
func (r *userRepository) UpsertByProvider(ctx context.Context, provider, providerID string, user *models.User) (*models.User, error) {
	now := time.Now()

	// Проверяем, существует ли пользователь
	existingUser, err := r.FindByProvider(ctx, provider, providerID)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing user: %w", err)
	}

	// Если пользователь существует - обновляем базовые поля, НЕ трогаем roles
	if existingUser != nil {
		// Обновляем email, avatar, name (если пришел), updated_at. Роли НЕ трогаем
		setUpdate := bson.M{
			"email":      user.Email,
			"avatar_url": user.AvatarURL,
			"updated_at": now,
		}
		if user.Name != "" {
			setUpdate["name"] = user.Name
		}

		opts := options.FindOneAndUpdate().
			SetReturnDocument(options.After)

		var result models.User
		err = r.collection.FindOneAndUpdate(
			ctx,
			bson.M{
				"provider":    provider,
				"provider_id": providerID,
			},
			bson.M{"$set": setUpdate},
			opts,
		).Decode(&result)

		if err != nil {
			return nil, fmt.Errorf("failed to update existing user: %w", err)
		}

		return &result, nil
	}

	// Если пользователя нет, создаем нового: используем имя из профиля, иначе fallback "Аноним+номер"
	anonymousNumber := fmt.Sprintf("%d", now.UnixNano()%1000000)
	resolvedName := user.Name
	if resolvedName == "" {
		resolvedName = fmt.Sprintf("Аноним%s", anonymousNumber)
	}

	newUser := &models.User{
		Email:      user.Email,
		Name:       resolvedName,
		Roles:      []string{"Студент"},
		AvatarURL:  user.AvatarURL,
		Provider:   provider,
		ProviderID: providerID,
		IsActive:   true,
		Blocked:    false,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	result, err := r.collection.InsertOne(ctx, newUser)
	if err != nil {
		return nil, fmt.Errorf("failed to create new user: %w", err)
	}

	if oid, ok := result.InsertedID.(primitive.ObjectID); ok {
		newUser.ID = oid
	}

	return newUser, nil
}

// UpdateRoles обновляет роли пользователя
func (r *userRepository) UpdateRoles(ctx context.Context, userID primitive.ObjectID, roles []string) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": userID},
		bson.M{
			"$set": bson.M{
				"roles":      roles,
				"updated_at": time.Now(),
			},
		},
	)

	if err != nil {
		return fmt.Errorf("failed to update user roles: %w", err)
	}

	return nil
}

// GetAll получает всех пользователей
func (r *userRepository) GetAll(ctx context.Context) ([]*models.User, error) {
	cursor, err := r.collection.Find(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("failed to find users: %w", err)
	}
	defer cursor.Close(ctx)

	var users []*models.User
	for cursor.Next(ctx) {
		var user models.User
		if err := cursor.Decode(&user); err != nil {
			return nil, fmt.Errorf("failed to decode user: %w", err)
		}
		users = append(users, &user)
	}

	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("cursor error: %w", err)
	}

	return users, nil
}

// GetUserByID получает пользователя по строковому ID
func (r *userRepository) GetUserByID(ctx context.Context, userID string) (*models.User, error) {
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID format: %w", err)
	}

	return r.FindByID(ctx, oid)
}

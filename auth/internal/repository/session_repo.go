package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/models"
)

type SessionRepository interface {
	Create(ctx context.Context, session *models.LoginSession) error
	FindByLoginToken(ctx context.Context, loginToken string) (*models.LoginSession, error)
	UpdateStatus(ctx context.Context, loginToken string, status models.SessionStatus) error
	UpdateTokens(ctx context.Context, loginToken, accessToken, refreshToken string, userID primitive.ObjectID) error
	SetCode(ctx context.Context, loginToken, code string) error
	CleanupExpired(ctx context.Context) error
}

type sessionRepository struct {
	collection *mongo.Collection
}

func NewSessionRepository(db *mongo.Database) SessionRepository {
	collection := db.Collection("login_sessions")

	// Создаем TTL индекс для автоматического удаления просроченных сессий
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, _ = collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "login_token", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys:    bson.D{{Key: "expires_at", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(0),
		},
	})

	return &sessionRepository{
		collection: collection,
	}
}

func (r *sessionRepository) Create(ctx context.Context, session *models.LoginSession) error {
	session.CreatedAt = time.Now()
	session.UpdatedAt = time.Now()
	session.ExpiresAt = time.Now().Add(5 * time.Minute) // По ТЗ: сессия ожидания авторизации живет 5 минут

	_, err := r.collection.InsertOne(ctx, session)
	return err
}

func (r *sessionRepository) FindByLoginToken(ctx context.Context, loginToken string) (*models.LoginSession, error) {
	var session models.LoginSession
	err := r.collection.FindOne(ctx, bson.M{"login_token": loginToken}).Decode(&session)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &session, err
}

func (r *sessionRepository) UpdateStatus(ctx context.Context, loginToken string, status models.SessionStatus) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"login_token": loginToken},
		bson.M{
			"$set": bson.M{
				"status":     status,
				"updated_at": time.Now(),
			},
		},
	)
	return err
}

func (r *sessionRepository) UpdateTokens(ctx context.Context, loginToken, accessToken, refreshToken string, userID primitive.ObjectID) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"login_token": loginToken},
		bson.M{
			"$set": bson.M{
				"status":        models.StatusGranted,
				"user_id":       userID,
				"access_token":  accessToken,
				"refresh_token": refreshToken,
				"updated_at":    time.Now(),
				"expires_at":    time.Now().Add(30 * time.Minute), // Увеличиваем время жизни
			},
		},
	)
	return err
}

func (r *sessionRepository) SetCode(ctx context.Context, loginToken, code string) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"login_token": loginToken},
		bson.M{
			"$set": bson.M{
				"code":       code,
				"updated_at": time.Now(),
			},
		},
	)
	return err
}

func (r *sessionRepository) CleanupExpired(ctx context.Context) error {
	_, err := r.collection.DeleteMany(
		ctx,
		bson.M{
			"expires_at": bson.M{"$lt": time.Now()},
		},
	)
	return err
}

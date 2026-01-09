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

type UserRepository interface {
	Create(ctx context.Context, user *models.User) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByProvider(ctx context.Context, provider, providerID string) (*models.User, error)
	Update(ctx context.Context, id primitive.ObjectID, update bson.M) error
	UpsertByProvider(ctx context.Context, provider, providerID string, user *models.User) (*models.User, error)
}

type userRepository struct {
	collection *mongo.Collection
}

func NewUserRepository(db *mongo.Database) UserRepository {
	collection := db.Collection("users")

	// Создаем индексы
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, _ = collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "email", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys:    bson.D{{Key: "provider", Value: 1}, {Key: "provider_id", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
	})

	return &userRepository{
		collection: collection,
	}
}

func (r *userRepository) Create(ctx context.Context, user *models.User) error {
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	_, err := r.collection.InsertOne(ctx, user)
	return err
}

func (r *userRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &user, err
}

func (r *userRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &user, err
}

func (r *userRepository) FindByProvider(ctx context.Context, provider, providerID string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{
		"provider":    provider,
		"provider_id": providerID,
	}).Decode(&user)

	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &user, err
}

func (r *userRepository) Update(ctx context.Context, id primitive.ObjectID, update bson.M) error {
	update["updated_at"] = time.Now()

	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": update},
	)
	return err
}

func (r *userRepository) UpsertByProvider(ctx context.Context, provider, providerID string, user *models.User) (*models.User, error) {
	user.UpdatedAt = time.Now()

	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)

	var result models.User
	err := r.collection.FindOneAndUpdate(
		ctx,
		bson.M{
			"provider":    provider,
			"provider_id": providerID,
		},
		bson.M{
			"$set": user,
			"$setOnInsert": bson.M{
				"created_at": time.Now(),
			},
		},
		opts,
	).Decode(&result)

	if err != nil {
		return nil, err
	}

	return &result, nil
}

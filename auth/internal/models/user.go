package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type RefreshToken struct {
	Token     string    `bson:"token" json:"token"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	ExpiresAt time.Time `bson:"expires_at" json:"expires_at"`
	UserAgent string    `bson:"user_agent,omitempty" json:"user_agent,omitempty"`
	IPAddress string    `bson:"ip_address,omitempty" json:"ip_address,omitempty"`
	Device    string    `bson:"device,omitempty" json:"device,omitempty"`
}

// User представляет пользователя в системе
type User struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email      string             `bson:"email" json:"email" validate:"required,email"`
	Name       string             `bson:"name" json:"name" validate:"required"`
	Roles      []string           `bson:"roles" json:"roles"`
	AvatarURL  string             `bson:"avatar_url,omitempty" json:"avatar_url,omitempty"`
	Provider   string             `bson:"provider" json:"provider"` // github, yandex, code
	ProviderID string             `bson:"provider_id,omitempty" json:"provider_id,omitempty"`
	IsActive   bool               `bson:"is_active" json:"is_active" default:"true"`
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt  time.Time          `bson:"updated_at" json:"updated_at"`
}

// UserData для ответа API
type UserData struct {
	ID        string   `json:"id"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	Roles     []string `json:"roles"`
	AvatarURL string   `json:"avatar_url,omitempty"`
}

// ConvertToUserData преобразует User в UserData
func (u *User) ConvertToUserData() UserData {
	return UserData{
		ID:        u.ID.Hex(),
		Email:     u.Email,
		Name:      u.Name,
		Roles:     u.Roles,
		AvatarURL: u.AvatarURL,
	}
}

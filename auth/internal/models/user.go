// internal/models/user.go
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email         string             `bson:"email" json:"email"`
	FullName      string             `bson:"full_name" json:"full_name"`
	Roles         []string           `bson:"roles" json:"roles"`
	Blocked       bool               `bson:"blocked" json:"blocked"`
	RefreshTokens []RefreshToken     `bson:"refresh_tokens" json:"-"`
	CreatedAt     time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at" json:"updated_at"`
}

type RefreshToken struct {
	Token     string    `bson:"token" json:"token"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	ExpiresAt time.Time `bson:"expires_at" json:"expires_at"`
	UserAgent string    `bson:"user_agent" json:"user_agent"`
	IPAddress string    `bson:"ip_address" json:"ip_address"`
}

type UserCreate struct {
	Email    string   `json:"email" binding:"required,email"`
	FullName string   `json:"full_name" binding:"required"`
	Roles    []string `json:"roles"`
}

type UserUpdate struct {
	FullName *string   `json:"full_name,omitempty"`
	Roles    *[]string `json:"roles,omitempty"`
	Blocked  *bool     `json:"blocked,omitempty"`
}

package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SessionStatus статусы сессии авторизации
type SessionStatus string

const (
	StatusPending SessionStatus = "pending" // Ожидает авторизации
	StatusGranted SessionStatus = "granted" // Авторизация успешна
	StatusDenied  SessionStatus = "denied"  // Авторизация отклонена
	StatusExpired SessionStatus = "expired" // Сессия истекла
)

// LoginSession представляет сессию входа
type LoginSession struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	LoginToken   string             `bson:"login_token" json:"login_token"`
	Status       SessionStatus      `bson:"status" json:"status"`
	Type         string             `bson:"type" json:"type"` // github, yandex, code
	ProviderData map[string]string  `bson:"provider_data,omitempty" json:"provider_data,omitempty"`
	UserID       primitive.ObjectID `bson:"user_id,omitempty" json:"user_id,omitempty"`
	AccessToken  string             `bson:"access_token,omitempty" json:"access_token,omitempty"`
	RefreshToken string             `bson:"refresh_token,omitempty" json:"refresh_token,omitempty"`
	Code         string             `bson:"code,omitempty" json:"code,omitempty"` // Для типа "code"
	CodeExpiresAt time.Time         `bson:"code_expires_at,omitempty" json:"code_expires_at,omitempty"`
	ExpiresAt    time.Time          `bson:"expires_at" json:"expires_at"`
	CreatedAt    time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time          `bson:"updated_at" json:"updated_at"`
}

// AuthCode для авторизации по коду
type AuthCode struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Code       string             `bson:"code" json:"code"`
	Email      string             `bson:"email" json:"email"`
	LoginToken string             `bson:"login_token" json:"login_token"`
	IsUsed     bool               `bson:"is_used" json:"is_used"`
	ExpiresAt  time.Time          `bson:"expires_at" json:"expires_at"`
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
}

// TokenPair пара токенов
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type" default:"Bearer"`
	ExpiresIn    int64  `json:"expires_in"`
}

// InitRequest запрос на инициализацию авторизации
type InitRequest struct {
	Type       string `json:"type" binding:"required,oneof=github yandex code"`
	LoginToken string `json:"login_token" binding:"required"`
}

// InitResponse ответ на инициализацию
type InitResponse struct {
	AuthURL string `json:"auth_url"`
}

// VerifyResponse ответ на проверку статуса
type VerifyResponse struct {
	Status       SessionStatus `json:"status"`
	AccessToken  string        `json:"access_token,omitempty"`
	RefreshToken string        `json:"refresh_token,omitempty"`
	UserData     *UserData     `json:"user_data,omitempty"`
}

// RefreshRequest запрос на обновление токенов
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// RefreshResponse ответ на обновление токенов
type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// LogoutRequest запрос на выход
type LogoutRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// GenerateCodeRequest запрос на генерацию кода авторизации
type GenerateCodeRequest struct {
	LoginToken string `json:"login_token" binding:"required"`
	Email      string `json:"email" binding:"required,email"`
}

// GenerateCodeResponse ответ на генерацию кода
type GenerateCodeResponse struct {
	Code string `json:"code"`
}

// VerifyCodeRequest запрос на проверку кода авторизации
type VerifyCodeRequest struct {
	LoginToken   string `json:"login_token" binding:"required"`
	Code         string `json:"code" binding:"required"`
	RefreshToken string `json:"refresh_token"` // Может использоваться как fallback, если email не сохранен в сессии
}

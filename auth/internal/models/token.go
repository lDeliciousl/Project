package models

import "github.com/golang-jwt/jwt/v4"

// Claims для access токена
type Claims struct {
	UserID string   `json:"user_id"`
	Email  string   `json:"email"`
	Roles  []string `json:"roles"`
	jwt.RegisteredClaims
}

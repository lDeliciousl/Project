// pkg/jwt/jwt_service.go
package jwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v4"

	"github.com/yourname/auth-module/internal/config"
	"github.com/yourname/auth-module/internal/models"
)

type JWTService interface {
	GenerateAccessToken(user *models.User) (string, error)
	GenerateRefreshToken(email string) (string, error)
	ValidateAccessToken(tokenString string) (*models.Claims, error)
	ValidateRefreshToken(tokenString string) (*models.RefreshClaims, error)
	GetTokenPair(user *models.User) (*models.TokenPair, error)
}

type jwtService struct {
	accessSecret  []byte
	refreshSecret []byte
	accessExpiry  time.Duration
	refreshExpiry time.Duration
}

func NewJWTService(cfg *config.JWTConfig) JWTService {
	return &jwtService{
		accessSecret:  []byte(cfg.AccessTokenSecret),
		refreshSecret: []byte(cfg.RefreshTokenSecret),
		accessExpiry:  cfg.AccessTokenExpiry,
		refreshExpiry: cfg.RefreshTokenExpiry,
	}
}

func (s *jwtService) GenerateAccessToken(user *models.User) (string, error) {
	claims := &models.Claims{
		UserID:      user.ID.Hex(),
		Email:       user.Email,
		Roles:       user.Roles,
		Permissions: s.generatePermissions(user.Roles),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.accessExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "auth-module",
			Subject:   user.ID.Hex(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.accessSecret)
}

func (s *jwtService) GenerateRefreshToken(email string) (string, error) {
	claims := &models.RefreshClaims{
		Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.refreshExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "auth-module",
			Subject:   email,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.refreshSecret)
}

func (s *jwtService) ValidateAccessToken(tokenString string) (*models.Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &models.Claims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return s.accessSecret, nil
		})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*models.Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

func (s *jwtService) ValidateRefreshToken(tokenString string) (*models.RefreshClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &models.RefreshClaims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return s.refreshSecret, nil
		})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*models.RefreshClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid refresh token")
}

func (s *jwtService) GetTokenPair(user *models.User) (*models.TokenPair, error) {
	accessToken, err := s.GenerateAccessToken(user)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.GenerateRefreshToken(user.Email)
	if err != nil {
		return nil, err
	}

	return &models.TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int64(s.accessExpiry.Seconds()),
	}, nil
}

func (s *jwtService) generatePermissions(roles []string) []string {
	rolePermissions := map[string][]string{
		"student": {
			"user:data:read:self",
			"course:user:add:self",
			"test:answer:create:self",
			"test:answer:update:self",
			"test:answer:read:self",
		},
		"teacher": {
			"user:data:read:self",
			"course:info:write:own",
			"course:test:write:own",
			"course:test:add:own",
			"course:test:del:own",
			"test:answer:read:all",
			"quest:create",
			"quest:update:own",
			"quest:read:all",
		},
		"admin": {
			"user:list:read",
			"user:roles:write",
			"user:block:write",
			"course:add",
			"course:del",
			"course:info:write:all",
			"quest:create",
			"quest:update:all",
			"quest:del",
		},
	}

	permissions := []string{}
	added := make(map[string]bool)

	for _, role := range roles {
		if perms, ok := rolePermissions[role]; ok {
			for _, perm := range perms {
				if !added[perm] {
					permissions = append(permissions, perm)
					added[perm] = true
				}
			}
		}
	}

	return permissions
}

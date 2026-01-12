package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/models"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/repository"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/pkg/jwt"
)

// TokenService интерфейс для работы с токенами
type TokenService interface {
	GenerateTokens(ctx context.Context, userID primitive.ObjectID, email string, roles []string) (*models.TokenPair, error)
	ValidateAccessToken(ctx context.Context, tokenString string) (*models.Claims, error)
	ValidateRefreshToken(ctx context.Context, tokenString string) (*models.User, error)
	RefreshTokens(ctx context.Context, refreshToken string) (*models.TokenPair, error)
	RevokeRefreshToken(ctx context.Context, refreshToken string) error
	RevokeAllUserTokens(ctx context.Context, userID primitive.ObjectID) error
	GetUserTokens(ctx context.Context, userID primitive.ObjectID) ([]models.RefreshToken, error)
}

// tokenService реализация TokenService
type tokenService struct {
	jwtService    jwt.JWTService
	userRepo      repository.UserRepository
	sessionRepo   repository.SessionRepository
	refreshExpiry time.Duration
}

// NewTokenService создает новый сервис токенов
func NewTokenService(
	jwtService jwt.JWTService,
	userRepo repository.UserRepository,
	sessionRepo repository.SessionRepository,
) TokenService {
	return &tokenService{
		jwtService:    jwtService,
		userRepo:      userRepo,
		sessionRepo:   sessionRepo,
		refreshExpiry: 7 * 24 * time.Hour, // 7 дней по умолчанию
	}
}

// GenerateTokens генерирует новую пару токенов (access + refresh)
func (s *tokenService) GenerateTokens(ctx context.Context, userID primitive.ObjectID, email string, roles []string) (*models.TokenPair, error) {
	// 1. Генерируем access токен
	accessToken, err := s.jwtService.GenerateAccessToken(userID.Hex(), email, roles)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	// 2. Генерируем refresh токен
	refreshToken, err := s.jwtService.GenerateRefreshToken(email)
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token: %w", err)
	}

	// 3. Сохраняем refresh токен в базе данных
	refreshTokenModel := models.RefreshToken{
		Token:     refreshToken,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(s.refreshExpiry),
	}

	// Обновляем пользователя, добавляя refresh токен
	err = s.userRepo.Update(ctx, userID, bson.M{
		"$push": bson.M{
			"refresh_tokens": refreshTokenModel,
		},
		"$set": bson.M{
			"updated_at": time.Now(),
		},
	})

	if err != nil {
		return nil, fmt.Errorf("failed to save refresh token: %w", err)
	}

	// 4. Возвращаем пару токенов
	return &models.TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    15 * 60, // 15 минут в секундах
	}, nil
}

// ValidateAccessToken валидирует access токен
func (s *tokenService) ValidateAccessToken(ctx context.Context, tokenString string) (*models.Claims, error) {
	claims, err := s.jwtService.ValidateAccessToken(tokenString)
	if err != nil {
		return nil, fmt.Errorf("invalid access token: %w", err)
	}

	// Дополнительная проверка: пользователь существует и активен
	userID, err := primitive.ObjectIDFromHex(claims.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID in token: %w", err)
	}

	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to find user: %w", err)
	}

	if user == nil {
		return nil, errors.New("user not found")
	}

	if !user.IsActive {
		return nil, errors.New("user account is inactive")
	}

	if user.Blocked {
		return nil, errors.New("user account is blocked")
	}

	return claims, nil
}

// ValidateRefreshToken валидирует refresh токен
func (s *tokenService) ValidateRefreshToken(ctx context.Context, tokenString string) (*models.User, error) {
	// 1. Валидируем JWT токен
	email, err := s.jwtService.ValidateRefreshToken(tokenString)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token: %w", err)
	}

	// 2. Находим пользователя по email
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("failed to find user: %w", err)
	}

	if user == nil {
		return nil, errors.New("user not found")
	}

	// 3. Проверяем, что refresh токен есть в базе данных
	tokenFound := false
	for _, token := range user.RefreshTokens {
		if token.Token == tokenString {
			// Проверяем не истек ли токен
			if time.Now().After(token.ExpiresAt) {
				return nil, errors.New("refresh token expired")
			}
			tokenFound = true
			break
		}
	}

	if !tokenFound {
		return nil, errors.New("refresh token not found in database")
	}

	// 4. Проверяем статус пользователя
	if !user.IsActive {
		return nil, errors.New("user account is inactive")
	}

	if user.Blocked {
		return nil, errors.New("user account is blocked")
	}

	return user, nil
}

// RefreshTokens обновляет пару токенов
func (s *tokenService) RefreshTokens(ctx context.Context, refreshToken string) (*models.TokenPair, error) {
	// 1. Валидируем старый refresh токен
	user, err := s.ValidateRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token: %w", err)
	}

	// 2. Отзываем старый refresh токен
	err = s.RevokeRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, fmt.Errorf("failed to revoke old refresh token: %w", err)
	}

	// 3. Генерируем новые токены
	newTokens, err := s.GenerateTokens(ctx, user.ID, user.Email, user.Roles)
	if err != nil {
		return nil, fmt.Errorf("failed to generate new tokens: %w", err)
	}

	return newTokens, nil
}

// RevokeRefreshToken отзывает (удаляет) refresh токен
func (s *tokenService) RevokeRefreshToken(ctx context.Context, refreshToken string) error {
	// Валидируем токен и извлекаем email
	email, err := s.jwtService.ValidateRefreshToken(refreshToken)
	if err != nil {
		return fmt.Errorf("invalid refresh token: %w", err)
	}

	// Находим пользователя с этим токеном
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return fmt.Errorf("failed to find user: %w", err)
	}

	if user == nil {
		return errors.New("user not found")
	}

	// Удаляем токен из массива refresh_tokens
	err = s.userRepo.Update(ctx, user.ID, bson.M{
		"$pull": bson.M{
			"refresh_tokens": bson.M{
				"token": refreshToken,
			},
		},
		"$set": bson.M{
			"updated_at": time.Now(),
		},
	})

	if err != nil {
		return fmt.Errorf("failed to revoke refresh token: %w", err)
	}

	return nil
}

// RevokeAllUserTokens отзывает все токены пользователя
func (s *tokenService) RevokeAllUserTokens(ctx context.Context, userID primitive.ObjectID) error {
	err := s.userRepo.Update(ctx, userID, bson.M{
		"$set": bson.M{
			"refresh_tokens": []models.RefreshToken{},
			"updated_at":     time.Now(),
		},
	})

	if err != nil {
		return fmt.Errorf("failed to revoke all tokens: %w", err)
	}

	return nil
}

// GetUserTokens возвращает все refresh токены пользователя
func (s *tokenService) GetUserTokens(ctx context.Context, userID primitive.ObjectID) ([]models.RefreshToken, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to find user: %w", err)
	}

	if user == nil {
		return nil, errors.New("user not found")
	}

	return user.RefreshTokens, nil
}

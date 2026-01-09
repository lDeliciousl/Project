// internal/services/user_service.go
package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/yourname/auth-module/internal/models"
	"github.com/yourname/auth-module/internal/repository"
)

type UserService interface {
	FindOrCreateByEmail(ctx context.Context, email, fullName string) (*models.User, error)
	GetUserByID(ctx context.Context, id string) (*models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
}

type userService struct {
	userRepo repository.UserRepository
}

func NewUserService(userRepo repository.UserRepository) UserService {
	return &userService{
		userRepo: userRepo,
	}
}

func (s *userService) FindOrCreateByEmail(ctx context.Context, email, fullName string) (*models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	if !isValidEmail(email) {
		return nil, errors.New("invalid email format")
	}

	existingUser, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil && !strings.Contains(err.Error(), "not found") {
		return nil, err
	}

	if existingUser != nil {
		return existingUser, nil
	}

	if strings.TrimSpace(fullName) == "" {
		parts := strings.Split(email, "@")
		fullName = "User" + parts[0][:min(len(parts[0]), 4)]
	}

	user := &models.User{
		Email:     email,
		FullName:  fullName,
		Roles:     []string{"student"},
		Blocked:   false,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *userService) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	return s.userRepo.FindByID(ctx, id)
}

func (s *userService) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	return s.userRepo.FindByEmail(ctx, email)
}

func isValidEmail(email string) bool {
	return strings.Contains(email, "@") && strings.Contains(email, ".")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

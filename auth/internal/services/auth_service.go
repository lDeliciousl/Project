package services

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/models"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/repository"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/pkg/jwt"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/pkg/oauth"
)

// AuthService сервис для работы с авторизацией
type AuthService interface {
	InitAuth(ctx context.Context, authType, loginToken string) (string, error)
	HandleOAuthCallback(ctx context.Context, providerType, code, state string) error
	VerifyAuthStatus(ctx context.Context, loginToken string) (*models.VerifyResponse, error)
	GenerateAuthCode(ctx context.Context, loginToken, email string) (string, error)
	VerifyAuthCode(ctx context.Context, loginToken, code, refreshToken string) error
	RefreshTokens(ctx context.Context, refreshToken string) (*models.TokenPair, error)
	Logout(ctx context.Context, refreshToken string) error
}

type authService struct {
	sessionRepo  repository.SessionRepository
	userRepo     repository.UserRepository
	jwtService   jwt.JWTService
	oauthManager *oauth.Manager
	codeExpiry   time.Duration
}

func NewAuthService(
	sessionRepo repository.SessionRepository,
	userRepo repository.UserRepository,
	jwtService jwt.JWTService,
	oauthManager *oauth.Manager,
) AuthService {
	return &authService{
		sessionRepo:  sessionRepo,
		userRepo:     userRepo,
		jwtService:   jwtService,
		oauthManager: oauthManager,
		codeExpiry:   1 * time.Minute, // По ТЗ: код живет 1 минуту
	}
}

// InitAuth инициализирует процесс авторизации
func (s *authService) InitAuth(ctx context.Context, authType, loginToken string) (string, error) {
	// Проверяем тип авторизации
	switch authType {
	case "github", "yandex":
		return s.initOAuth(ctx, authType, loginToken)
	case "code":
		return s.initCodeAuth(ctx, loginToken)
	default:
		return "", fmt.Errorf("unsupported auth type: %s", authType)
	}
}

// initOAuth инициализирует OAuth авторизацию
func (s *authService) initOAuth(ctx context.Context, providerType, loginToken string) (string, error) {
	// Создаем сессию
	session := &models.LoginSession{
		LoginToken: loginToken,
		Status:     models.StatusPending,
		Type:       providerType,
	}

	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}

	// Получаем URL для редиректа
	authURL, err := s.oauthManager.GetAuthURL(oauth.ProviderType(providerType), loginToken)
	if err != nil {
		return "", fmt.Errorf("failed to get auth URL: %w", err)
	}

	return authURL, nil
}

// initCodeAuth инициализирует авторизацию по коду
func (s *authService) initCodeAuth(ctx context.Context, loginToken string) (string, error) {
	// Создаем сессию для кода
	session := &models.LoginSession{
		LoginToken: loginToken,
		Status:     models.StatusPending,
		Type:       "code",
	}

	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}

	// Для кодовой авторизации не нужен URL для редиректа
	// Клиент должен отправить email и получить код
	return "code_auth_initialized", nil
}

// HandleOAuthCallback обрабатывает callback от OAuth провайдера
func (s *authService) HandleOAuthCallback(ctx context.Context, providerType, code, state string) error {
	// state - это наш login_token
	loginToken := state

	// Получаем сессию
	session, err := s.sessionRepo.FindByLoginToken(ctx, loginToken)
	if err != nil {
		return fmt.Errorf("failed to find session: %w", err)
	}

	if session == nil {
		return errors.New("session not found")
	}

	if session.Status != models.StatusPending {
		// Повторный callback или гонка запросов.
		// Если уже выдали токены — считаем успешным и ничего не делаем.
		if session.Status == models.StatusGranted {
			return nil
		}
		return fmt.Errorf("session status is %s, expected pending", session.Status)
	}

	// Обрабатываем OAuth callback
	user, err := s.oauthManager.HandleCallback(ctx, oauth.ProviderType(providerType), code)
	if err != nil {
		// Обновляем статус на denied при ошибке
		_ = s.sessionRepo.UpdateStatus(ctx, loginToken, models.StatusDenied)
		return fmt.Errorf("failed to handle OAuth callback: %w", err)
	}

	// Сохраняем или обновляем пользователя
	dbUser, err := s.userRepo.UpsertByProvider(ctx, providerType, user.ProviderID, user)
	if err != nil {
		_ = s.sessionRepo.UpdateStatus(ctx, loginToken, models.StatusDenied)
		return fmt.Errorf("failed to save user: %w", err)
	}

	// Генерируем токены
	accessToken, err := s.jwtService.GenerateAccessToken(
		dbUser.ID.Hex(),
		dbUser.Email,
		dbUser.Roles,
	)
	if err != nil {
		return fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, err := s.jwtService.GenerateRefreshToken(dbUser.Email)
	if err != nil {
		return fmt.Errorf("failed to generate refresh token: %w", err)
	}

	// Сохраняем refresh токен в БД пользователя (по ТЗ)
	refreshTokenModel := models.RefreshToken{
		Token:     refreshToken,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour), // 7 дней
	}
	err = s.userRepo.AddRefreshToken(ctx, dbUser.ID, refreshTokenModel)
	if err != nil {
		return fmt.Errorf("failed to save refresh token: %w", err)
	}

	// Обновляем сессию с токенами
	err = s.sessionRepo.UpdateTokens(ctx, loginToken, accessToken, refreshToken, dbUser.ID)
	if err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

// GenerateAuthCode генерирует код для авторизации
func (s *authService) GenerateAuthCode(ctx context.Context, loginToken, email string) (string, error) {
	// Проверяем сессию
	session, err := s.sessionRepo.FindByLoginToken(ctx, loginToken)
	if err != nil {
		return "", fmt.Errorf("failed to find session: %w", err)
	}

	if session == nil {
		return "", errors.New("session not found")
	}

	if session.Type != "code" {
		return "", errors.New("invalid session type")
	}

	// Генерируем случайный код (6 цифр)
	code := generateRandomCode(6)

	// Сохраняем код в сессии
	codeExpiresAt := time.Now().Add(s.codeExpiry)
	err = s.sessionRepo.SetCode(ctx, loginToken, code, email, codeExpiresAt)
	if err != nil {
		return "", fmt.Errorf("failed to set code: %w", err)
	}

	return code, nil
}

// VerifyAuthCode проверяет код авторизации
func (s *authService) VerifyAuthCode(ctx context.Context, loginToken, code, refreshToken string) error {
	// Получаем сессию
	session, err := s.sessionRepo.FindByLoginToken(ctx, loginToken)
	if err != nil {
		return fmt.Errorf("failed to find session: %w", err)
	}

	if session == nil {
		return errors.New("session not found")
	}

	if session.Type != "code" {
		return errors.New("invalid session type")
	}

	// Проверяем код
	if session.Code != code {
		return errors.New("invalid code")
	}

	if !session.CodeExpiresAt.IsZero() && time.Now().After(session.CodeExpiresAt) {
		return errors.New("code expired")
	}

	email := ""
	if session.ProviderData != nil {
		email = session.ProviderData["email"]
	}
	if email == "" && refreshToken != "" {
		// fallback: если клиент все же прислал refresh token
		fallbackEmail, err := s.jwtService.ValidateRefreshToken(refreshToken)
		if err != nil {
			return fmt.Errorf("invalid refresh token: %w", err)
		}
		email = fallbackEmail
	}
	if email == "" {
		return errors.New("email not found for code auth")
	}

	// Создаем или находим пользователя
	user := &models.User{
		Email:      email,
		Provider:   "code",
		ProviderID: email, // Для code авторизации используем email как provider_id
		IsActive:   true,
		// Имя и роль будут установлены в UpsertByProvider для нового пользователя
	}

	dbUser, err := s.userRepo.UpsertByProvider(ctx, "code", email, user)
	if err != nil {
		return fmt.Errorf("failed to save user: %w", err)
	}

	// Генерируем токены
	accessToken, err := s.jwtService.GenerateAccessToken(
		dbUser.ID.Hex(),
		dbUser.Email,
		dbUser.Roles,
	)
	if err != nil {
		return fmt.Errorf("failed to generate access token: %w", err)
	}

	newRefreshToken, err := s.jwtService.GenerateRefreshToken(dbUser.Email)
	if err != nil {
		return fmt.Errorf("failed to generate refresh token: %w", err)
	}

	// Сохраняем refresh токен в БД пользователя (по ТЗ)
	refreshTokenModel := models.RefreshToken{
		Token:     newRefreshToken,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour), // 7 дней
	}
	err = s.userRepo.AddRefreshToken(ctx, dbUser.ID, refreshTokenModel)
	if err != nil {
		return fmt.Errorf("failed to save refresh token: %w", err)
	}

	// Обновляем сессию с токенами
	err = s.sessionRepo.UpdateTokens(ctx, loginToken, accessToken, newRefreshToken, dbUser.ID)
	if err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

// VerifyAuthStatus проверяет статус авторизации
func (s *authService) VerifyAuthStatus(ctx context.Context, loginToken string) (*models.VerifyResponse, error) {
	// Получаем сессию
	session, err := s.sessionRepo.FindByLoginToken(ctx, loginToken)
	if err != nil {
		return nil, fmt.Errorf("failed to find session: %w", err)
	}

	if session == nil {
		return &models.VerifyResponse{
			Status: models.StatusExpired,
		}, nil
	}

	// Проверяем не истекла ли сессия
	if time.Now().After(session.ExpiresAt) {
		_ = s.sessionRepo.UpdateStatus(ctx, loginToken, models.StatusExpired)
		return &models.VerifyResponse{
			Status: models.StatusExpired,
		}, nil
	}

	// Если авторизация не завершена, возвращаем текущий статус
	if session.Status != models.StatusGranted {
		return &models.VerifyResponse{
			Status: session.Status,
		}, nil
	}

	// Если авторизация завершена, получаем данные пользователя
	var userData *models.UserData

	if !session.UserID.IsZero() {
		user, err := s.userRepo.FindByID(ctx, session.UserID)
		if err == nil && user != nil {
			data := user.ConvertToUserData()
			userData = &data
		}
	}

	return &models.VerifyResponse{
		Status:       session.Status,
		AccessToken:  session.AccessToken,
		RefreshToken: session.RefreshToken,
		UserData:     userData,
	}, nil
}

// RefreshTokens обновляет токены
func (s *authService) RefreshTokens(ctx context.Context, refreshToken string) (*models.TokenPair, error) {
	// Валидируем refresh токен
	email, err := s.jwtService.ValidateRefreshToken(refreshToken)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token: %w", err)
	}

	// Находим пользователя по refresh токену (обязательная проверка наличия токена в БД)
	user, err := s.userRepo.FindByRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, fmt.Errorf("failed to find user: %w", err)
	}

	if user == nil {
		return nil, errors.New("user not found")
	}

	if user.Email != email {
		return nil, errors.New("refresh token does not belong to user")
	}

	if !user.IsActive {
		return nil, errors.New("user account is inactive")
	}

	if user.Blocked {
		return nil, errors.New("user account is blocked")
	}

	// Проверяем что refresh токен не истек (TTL индекс чистит не мгновенно)
	valid := false
	for _, t := range user.RefreshTokens {
		if t.Token == refreshToken {
			if time.Now().After(t.ExpiresAt) {
				return nil, errors.New("refresh token expired")
			}
			valid = true
			break
		}
	}
	if !valid {
		return nil, errors.New("refresh token not found in database")
	}

	// Генерируем новые токены
	accessToken, err := s.jwtService.GenerateAccessToken(
		user.ID.Hex(),
		user.Email,
		user.Roles,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	newRefreshToken, err := s.jwtService.GenerateRefreshToken(user.Email)
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token: %w", err)
	}

	// Отзываем старый refresh токен
	_ = s.userRepo.RemoveRefreshToken(ctx, user.ID, refreshToken)

	// Сохраняем новый refresh токен
	refreshTokenModel := models.RefreshToken{
		Token:     newRefreshToken,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	err = s.userRepo.AddRefreshToken(ctx, user.ID, refreshTokenModel)
	if err != nil {
		return nil, fmt.Errorf("failed to save refresh token: %w", err)
	}

	return &models.TokenPair{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    15 * 60, // 15 минут в секундах
	}, nil
}

// Logout выходит из системы
func (s *authService) Logout(ctx context.Context, refreshToken string) error {
	// Валидируем токен
	email, err := s.jwtService.ValidateRefreshToken(refreshToken)
	if err != nil {
		// Если токен невалидный, все равно считаем выход успешным
		return nil
	}

	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil || user == nil {
		return nil
	}

	_ = s.userRepo.RemoveRefreshToken(ctx, user.ID, refreshToken)

	return nil
}

// generateRandomCode генерирует случайный код из цифр
func generateRandomCode(length int) string {
	b := make([]byte, length)
	rand.Read(b)

	code := ""
	for i := 0; i < length; i++ {
		code += fmt.Sprintf("%d", b[i]%10)
	}

	return code
}

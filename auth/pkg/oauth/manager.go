package oauth

import (
	"context"
	"fmt"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/models"
	"golang.org/x/oauth2"
)

// ProviderType типы провайдеров
type ProviderType string

const (
	ProviderGitHub ProviderType = "github"
	ProviderYandex ProviderType = "yandex"
)

// Provider интерфейс OAuth провайдера
type Provider interface {
	GetAuthURL(state string) string
	ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error)
	GetUserInfo(ctx context.Context, token *oauth2.Token) (*models.User, error)
}

// Manager управляет OAuth провайдерами
type Manager struct {
	providers map[ProviderType]Provider
}

func NewManager(githubClientID, githubClientSecret, githubRedirectURL,
	yandexClientID, yandexClientSecret, yandexRedirectURL string) *Manager {

	providers := make(map[ProviderType]Provider)

	if githubClientID != "" && githubClientSecret != "" {
		providers[ProviderGitHub] = NewGitHubProvider(
			githubClientID,
			githubClientSecret,
			githubRedirectURL,
		)
	}

	if yandexClientID != "" && yandexClientSecret != "" {
		providers[ProviderYandex] = NewYandexProvider(
			yandexClientID,
			yandexClientSecret,
			yandexRedirectURL,
		)
	}

	return &Manager{
		providers: providers,
	}
}

// GetProvider возвращает провайдера по типу
func (m *Manager) GetProvider(providerType ProviderType) (Provider, error) {
	provider, exists := m.providers[providerType]
	if !exists {
		return nil, fmt.Errorf("provider %s not configured", providerType)
	}
	return provider, nil
}

// GetAuthURL возвращает URL для авторизации
func (m *Manager) GetAuthURL(providerType ProviderType, state string) (string, error) {
	provider, err := m.GetProvider(providerType)
	if err != nil {
		return "", err
	}
	return provider.GetAuthURL(state), nil
}

// HandleCallback обрабатывает callback от OAuth провайдера
func (m *Manager) HandleCallback(ctx context.Context, providerType ProviderType, code string) (*models.User, error) {
	provider, err := m.GetProvider(providerType)
	if err != nil {
		return nil, err
	}

	// Обмениваем код на токен
	token, err := provider.ExchangeCode(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code: %w", err)
	}

	// Получаем информацию о пользователе
	user, err := provider.GetUserInfo(ctx, token)
	if err != nil {
		return nil, fmt.Errorf("failed to get user info: %w", err)
	}

	return user, nil
}

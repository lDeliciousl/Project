package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/models"
)

// YandexEndpoint это OAuth2 эндпоинты Яндекса
var YandexEndpoint = oauth2.Endpoint{
	AuthURL:  "https://oauth.yandex.ru/authorize",
	TokenURL: "https://oauth.yandex.ru/token",
}

type YandexProvider struct {
	config *oauth2.Config
}

func NewYandexProvider(clientID, clientSecret, redirectURL string) *YandexProvider {
	return &YandexProvider{
		config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint:     YandexEndpoint,
			RedirectURL:  redirectURL,
			Scopes:       []string{"login:email", "login:info"},
		},
	}
}

// GetAuthURL возвращает URL для авторизации через Yandex
func (p *YandexProvider) GetAuthURL(state string) string {
	return p.config.AuthCodeURL(state, oauth2.AccessTypeOnline)
}

// ExchangeCode обменивает код на access token
func (p *YandexProvider) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
	return p.config.Exchange(ctx, code)
}

// GetUserInfo получает информацию о пользователе
func (p *YandexProvider) GetUserInfo(ctx context.Context, token *oauth2.Token) (*models.User, error) {
	client := p.config.Client(ctx, token)

	// Получаем информацию о пользователе
	req, err := http.NewRequestWithContext(ctx, "GET", "https://login.yandex.ru/info", nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var yandexUser struct {
		ID        string `json:"id"`
		Login     string `json:"login"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"default_email"`
		AvatarID  string `json:"default_avatar_id"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&yandexUser); err != nil {
		return nil, err
	}

	// Формируем полное имя
	fullName := yandexUser.FirstName
	if yandexUser.LastName != "" {
		if fullName != "" {
			fullName += " "
		}
		fullName += yandexUser.LastName
	}
	if fullName == "" {
		fullName = yandexUser.Login
	}

	// Формируем URL аватара
	avatarURL := ""
	if yandexUser.AvatarID != "" {
		avatarURL = fmt.Sprintf("https://avatars.yandex.net/get-yapic/%s/islands-200", yandexUser.AvatarID)
	}

	return &models.User{
		Email:      yandexUser.Email,
		Name:       fullName,
		AvatarURL:  avatarURL,
		Provider:   "yandex",
		ProviderID: yandexUser.ID,
		Roles:      []string{"Студент"},
		IsActive:   true,
	}, nil
}

package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"
	githuboauth "golang.org/x/oauth2/github"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/models"
)

type GitHubProvider struct {
	config *oauth2.Config
}

func NewGitHubProvider(clientID, clientSecret, redirectURL string) *GitHubProvider {
	return &GitHubProvider{
		config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint:     githuboauth.Endpoint,
			RedirectURL:  redirectURL,
			Scopes:       []string{"user:email"},
		},
	}
}

// GetAuthURL возвращает URL для авторизации через GitHub
func (p *GitHubProvider) GetAuthURL(state string) string {
	return p.config.AuthCodeURL(state, oauth2.AccessTypeOnline)
}

// ExchangeCode обменивает код на access token
func (p *GitHubProvider) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
	return p.config.Exchange(ctx, code)
}

// GetUserInfo получает информацию о пользователе
func (p *GitHubProvider) GetUserInfo(ctx context.Context, token *oauth2.Token) (*models.User, error) {
	client := p.config.Client(ctx, token)

	// Получаем основную информацию о пользователе
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var githubUser struct {
		ID        int    `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		AvatarURL string `json:"avatar_url"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&githubUser); err != nil {
		return nil, err
	}

	// Если email не пришел, получаем его отдельно
	if githubUser.Email == "" {
		email, err := p.getUserEmail(ctx, client)
		if err != nil {
			return nil, err
		}
		githubUser.Email = email
	}

	// Если имя не пришло, используем логин
	if githubUser.Name == "" {
		githubUser.Name = githubUser.Login
	}

	return &models.User{
		Email:      githubUser.Email,
		Name:       githubUser.Name,
		AvatarURL:  githubUser.AvatarURL,
		Provider:   "github",
		ProviderID: fmt.Sprintf("%d", githubUser.ID),
		Roles:      []string{"user"},
		IsActive:   true,
	}, nil
}

// getUserEmail получает email пользователя
func (p *GitHubProvider) getUserEmail(ctx context.Context, client *http.Client) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", err
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}

	// Ищем основной и подтвержденный email
	for _, email := range emails {
		if email.Primary && email.Verified {
			return email.Email, nil
		}
	}

	// Если не нашли, берем первый подтвержденный
	for _, email := range emails {
		if email.Verified {
			return email.Email, nil
		}
	}

	// Если нет подтвержденных, берем первый
	if len(emails) > 0 {
		return emails[0].Email, nil
	}

	return "", fmt.Errorf("no email found")
}

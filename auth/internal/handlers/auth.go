package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/configs"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/models"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/services"
)

type AuthHandler struct {
	authService services.AuthService
}

func NewAuthHandler(authService services.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// InitAuth инициализирует авторизацию
// @Summary Инициализация авторизации
// @Description Начинает процесс авторизации через указанный провайдер
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.InitRequest true "Данные для инициализации"
// @Success 200 {object} models.InitResponse
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/auth/init [post]
func (h *AuthHandler) InitAuth(c *gin.Context) {
	var req models.InitRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "Invalid request body",
		})
		return
	}

	authURL, err := h.authService.InitAuth(c.Request.Context(), req.Type, req.LoginToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.InitResponse{
		AuthURL: authURL,
	})
}

// VerifyAuth проверяет статус авторизации
// @Summary Проверка статуса авторизации
// @Description Проверяет статус авторизации по login_token
// @Tags auth
// @Accept json
// @Produce json
// @Param login_token path string true "Login Token"
// @Success 200 {object} models.VerifyResponse
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/auth/verify/{login_token} [get]
func (h *AuthHandler) VerifyAuth(c *gin.Context) {
	loginToken := c.Param("login_token")

	if loginToken == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "Login token is required",
		})
		return
	}

	response, err := h.authService.VerifyAuthStatus(c.Request.Context(), loginToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, response)
}

// OAuthCallback обрабатывает callback от OAuth провайдера
// @Summary Callback от OAuth провайдера
// @Description Обрабатывает callback после авторизации у провайдера
// @Tags auth
// @Accept json
// @Produce json
// @Param provider path string true "Провайдер (github, yandex)"
// @Param code query string true "Код авторизации"
// @Param state query string true "State (login_token)"
// @Success 302
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/auth/{provider}/callback [get]
func (h *AuthHandler) OAuthCallback(c *gin.Context) {
	provider := c.Param("provider")
	code := c.Query("code")
	state := c.Query("state")

	// Получаем URL web клиента из конфигурации
	webClientURL := "http://localhost:8000" // По умолчанию
	if cfg := configs.AppConfig; cfg != nil {
		webClientURL = cfg.WebClientURL
	}

	// Определяем провайдера, если параметр пути не заполнен
	if provider == "" {
		path := c.Request.URL.Path
		if strings.Contains(path, "github") {
			provider = "github"
		} else if strings.Contains(path, "yandex") {
			provider = "yandex"
		}
	}

	// Если всё ещё не удалось определить провайдера – возвращаем понятную ошибку
	if provider == "" {
		c.Redirect(http.StatusFound, webClientURL+"/auth/error?message=Unknown+OAuth+provider")
		return
	}

	if code == "" || state == "" {
		// Редирект на страницу ошибки в web клиенте
		c.Redirect(http.StatusFound, webClientURL+"/auth/error?message=Code and state are required")
		return
	}

	err := h.authService.HandleOAuthCallback(c.Request.Context(), provider, code, state)
	if err != nil {
		// Редирект на страницу ошибки в web клиенте
		c.Redirect(http.StatusFound, webClientURL+"/auth/error?message="+err.Error())
		return
	}

	// Редирект на web клиент с callback для проверки статуса
	// Web клиент проверит статус через /api/auth/verify/{login_token}
	c.Redirect(http.StatusFound, webClientURL+"/auth/callback?token="+state)
}

// RefreshToken обновляет токены
// @Summary Обновление токенов
// @Description Обновляет access и refresh токены
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.RefreshRequest true "Refresh token"
// @Success 200 {object} models.RefreshResponse
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/auth/refresh [post]
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req models.RefreshRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "Invalid request body",
		})
		return
	}

	tokens, err := h.authService.RefreshTokens(c.Request.Context(), req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, tokens)
}

// Logout выходит из системы
// @Summary Выход из системы
// @Description Инвалидирует refresh токен
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.LogoutRequest true "Refresh token"
// @Success 200
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	var req models.LogoutRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "Invalid request body",
		})
		return
	}

	err := h.authService.Logout(c.Request.Context(), req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: err.Error(),
		})
		return
	}

	c.Status(http.StatusOK)
}

// GenerateAuthCode генерирует код для авторизации по email
// @Summary Генерация кода авторизации
// @Description Генерирует код для авторизации по email
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.GenerateCodeRequest true "Данные для генерации кода"
// @Success 200 {object} models.GenerateCodeResponse
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/auth/code/generate [post]
func (h *AuthHandler) GenerateAuthCode(c *gin.Context) {
	var req models.GenerateCodeRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "Invalid request body",
		})
		return
	}

	code, err := h.authService.GenerateAuthCode(c.Request.Context(), req.LoginToken, req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.GenerateCodeResponse{
		Code: code,
	})
}

// VerifyAuthCode проверяет код авторизации
// @Summary Проверка кода авторизации
// @Description Проверяет код и завершает авторизацию. Email извлекается из refresh токена (по ТЗ)
// @Tags auth
// @Accept json
// @Produce json
// @Param request body models.VerifyCodeRequest true "Данные для проверки кода"
// @Success 200
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/auth/code/verify [post]
func (h *AuthHandler) VerifyAuthCode(c *gin.Context) {
	var req models.VerifyCodeRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "Invalid request body",
		})
		return
	}

	err := h.authService.VerifyAuthCode(c.Request.Context(), req.LoginToken, req.Code, req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Code verified successfully",
	})
}

// HealthCheck проверяет работоспособность сервиса
func (h *AuthHandler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "auth-module",
	})
}

// ErrorResponse структура для ошибок
type ErrorResponse struct {
	Error string `json:"error"`
}

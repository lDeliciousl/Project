package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/configs"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/handlers"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/repository"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/services"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/pkg/jwt"
	"github.com/lDeliciousl/Project/tree/auth-module/auth/pkg/oauth"
)

func main() {
	// 1. Загружаем конфигурацию
	if err := configs.Load(); err != nil {
		log.Fatalf("❌ Failed to load config: %v", err)
	}

	cfg := configs.AppConfig

	// 2. Подключаемся к MongoDB
	mongoClient, err := connectToMongoDB(cfg.Database.URI, cfg.Database.Timeout)
	if err != nil {
		log.Fatalf("❌ Failed to connect to MongoDB: %v", err)
	}
	defer mongoClient.Disconnect(context.Background())

	db := mongoClient.Database(cfg.Database.Name)

	// 3. Инициализируем репозитории
	userRepo := repository.NewUserRepository(db)
	sessionRepo := repository.NewSessionRepository(db)

	// 4. Инициализируем сервисы
	jwtService := jwt.NewJWTService(
		cfg.JWT.AccessSecret,
		cfg.JWT.RefreshSecret,
		cfg.JWT.AccessExpiry,
		cfg.JWT.RefreshExpiry,
	)

	oauthManager := oauth.NewManager(
		cfg.OAuth.GitHub.ClientID,
		cfg.OAuth.GitHub.ClientSecret,
		cfg.OAuth.GitHub.RedirectURL,
		cfg.OAuth.Yandex.ClientID,
		cfg.OAuth.Yandex.ClientSecret,
		cfg.OAuth.Yandex.RedirectURL,
	)

	authService := services.NewAuthService(
		sessionRepo,
		userRepo,
		jwtService,
		oauthManager,
	)

	// 5. Инициализируем обработчики
	authHandler := handlers.NewAuthHandler(authService)

	// 6. Настраиваем Gin
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	// 7. Настраиваем маршруты
	setupRoutes(router, authHandler)

	// 8. Настраиваем статические файлы
	//router.LoadHTMLGlob("web/templates/*")
	//router.Static("/static", "./web/static")

	// 9. Запускаем сервер
	server := &http.Server{
		Addr:         cfg.GetServerAddress(),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// Запуск в горутине
	go func() {
		log.Printf("🚀 Auth module started on http://%s", server.Addr)
		log.Printf("📚 API Documentation:")
		log.Printf("  POST /api/auth/init      - Инициализация авторизации")
		log.Printf("  GET  /api/auth/verify/:token - Проверка статуса")
		log.Printf("  POST /api/auth/refresh   - Обновление токенов")
		log.Printf("  POST /api/auth/logout    - Выход из системы")

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Failed to start server: %v", err)
		}
	}()

	// 10. Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("❌ Server forced to shutdown: %v", err)
	}

	log.Println("✅ Server stopped")
}

// connectToMongoDB подключается к MongoDB
func connectToMongoDB(uri string, timeout time.Duration) (*mongo.Client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	// Проверяем подключение
	err = client.Ping(ctx, nil)
	if err != nil {
		return nil, err
	}

	log.Println("✅ Connected to MongoDB")
	return client, nil
}

// setupRoutes настраивает маршруты
func setupRoutes(router *gin.Engine, handler *handlers.AuthHandler) {
	// Health check
	router.GET("/health", handler.HealthCheck)

	// API routes
	api := router.Group("/api")
	{
		auth := api.Group("/auth")
		{
			// Основные endpoint'ы
			auth.POST("/init", handler.InitAuth)
			auth.GET("/verify/:login_token", handler.VerifyAuth)
			auth.POST("/refresh", handler.RefreshToken)
			auth.POST("/logout", handler.Logout)

			// Авторизация по коду (email OTP)
			auth.POST("/code/generate", handler.GenerateAuthCode)
			auth.POST("/code/verify", handler.VerifyAuthCode)

			// Авторизация по коду подтверждения (с другого устройства по ТЗ)
			auth.POST("/confirm/verify", handler.VerifyConfirmCode)

			// OAuth callback'и
			auth.GET("/github/callback", handler.OAuthCallback)
			auth.GET("/yandex/callback", handler.OAuthCallback)

			// Управление пользователями
			auth.GET("/users/:user_id", handler.GetUserInfo)
			auth.PUT("/users/:user_id/roles", handler.UpdateUserRoles)

			// HTML страницы
			//auth.GET("/success", func(c *gin.Context) {
			//	c.HTML(http.StatusOK, "success.html", nil)
			//})

			auth.GET("/error", func(c *gin.Context) {
				errorMsg := c.Query("error")
				c.HTML(http.StatusOK, "error.html", gin.H{
					"Error": errorMsg,
				})
			})
		}
	}

	// Корневой маршрут
	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"service": "auth-module",
			"version": "1.0.0",
			"status":  "running",
			"endpoints": []gin.H{
				{"method": "POST", "path": "/api/auth/init", "description": "Инициализация авторизации"},
				{"method": "GET", "path": "/api/auth/verify/:token", "description": "Проверка статуса"},
				{"method": "POST", "path": "/api/auth/refresh", "description": "Обновление токенов"},
				{"method": "POST", "path": "/api/auth/logout", "description": "Выход из системы"},
			},
		})
	})
}

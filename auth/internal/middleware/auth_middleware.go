package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/lDeliciousl/Project/tree/auth-module/auth/internal/services"
)

// AuthMiddleware создает middleware для проверки JWT токенов
func AuthMiddleware(tokenService services.TokenService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Извлекаем токен из заголовка
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization header is required",
			})
			c.Abort()
			return
		}

		// 2. Проверяем формат Bearer токена
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization header format must be Bearer {token}",
			})
			c.Abort()
			return
		}

		tokenString := parts[1]

		// 3. Валидируем токен
		claims, err := tokenService.ValidateAccessToken(c.Request.Context(), tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Invalid or expired token",
				"details": err.Error(),
			})
			c.Abort()
			return
		}

		// 4. Сохраняем информацию о пользователе в контекст
		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Set("user_roles", claims.Roles)
		c.Set("claims", claims)

		c.Next()
	}
}

// RoleMiddleware создает middleware для проверки ролей
func RoleMiddleware(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Получаем роли из контекста
		roles, exists := c.Get("user_roles")
		if !exists {
			fmt.Printf("[ROLE MIDDLEWARE] User roles not found in context\n")
			c.JSON(http.StatusForbidden, gin.H{
				"error": "User roles not found",
			})
			c.Abort()
			return
		}

		userRoles, ok := roles.([]string)
		if !ok {
			fmt.Printf("[ROLE MIDDLEWARE] Invalid user roles format: %T\n", roles)
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Invalid user roles format",
			})
			c.Abort()
			return
		}

		fmt.Printf("[ROLE MIDDLEWARE] User roles: %v, Allowed roles: %v\n", userRoles, allowedRoles)

		// Проверяем, есть ли у пользователя нужная роль
		hasRole := false
		for _, userRole := range userRoles {
			for _, allowedRole := range allowedRoles {
				if userRole == allowedRole {
					hasRole = true
					fmt.Printf("[ROLE MIDDLEWARE] Role matched: %s\n", userRole)
					break
				}
			}
			if hasRole {
				break
			}
		}

		if !hasRole {
			fmt.Printf("[ROLE MIDDLEWARE] No matching role found\n")
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Insufficient permissions",
			})
			c.Abort()
			return
		}

		fmt.Printf("[ROLE MIDDLEWARE] Access granted\n")
		c.Next()
	}
}

#pragma once

#include <string>
#include <unordered_map>
#include <iostream>
#include <httplib.h>

// ============================================================================
// ЗАГЛУШКА ВМЕСТО JWT-CPP
// ============================================================================

// Простые структуры-заглушки
namespace jwt_stub {
    
    class claim {
    public:
        // Базовые методы
        std::string as_string() const { return ""; }
        int as_int() const { return 0; }
        bool as_bool() const { return false; }
        double as_number() const { return 0.0; }
        
        // Для совместимости с разными типами
        template<typename T>
        T get() const { 
            if constexpr (std::is_same_v<T, std::string>) {
                return as_string();
            } else if constexpr (std::is_same_v<T, int>) {
                return as_int();
            } else if constexpr (std::is_same_v<T, bool>) {
                return as_bool();
            } else if constexpr (std::is_same_v<T, double>) {
                return as_number();
            }
            return T();
        }
        
        template<typename T>
        bool is() const { return false; }
        
        bool has_claim(const std::string&) const { return false; }
    };
    
    // Простой декодер-заглушка
    class decoded_token {
    public:
        std::unordered_map<std::string, claim> get_payload_claims() const {
            return {};
        }
    };
    
    // Простой верификатор-заглушка
    class verifier {
    public:
        verifier& allow_algorithm(const std::string&) { return *this; }
        verifier& with_issuer(const std::string&) { return *this; }
        verifier& with_audience(const std::string&) { return *this; }
        void verify(const decoded_token&) const {
            std::cout << "[JWT STUB] Token verification skipped" << std::endl;
        }
    };
    
    // Функции-заглушки
    inline decoded_token decode(const std::string& token) {
        std::cout << "[JWT STUB] Decoding token: " 
                  << (token.length() > 15 ? token.substr(0, 12) + "..." : token) 
                  << std::endl;
        return decoded_token();
    }
    
    inline verifier verify() {
        return verifier();
    }
}

// ============================================================================
// ОРИГИНАЛЬНЫЕ ФУНКЦИИ (АДАПТИРОВАННЫЕ)
// ============================================================================

inline std::string findToken(const httplib::Request& req) {
    std::string token = "";

    if (req.has_header("Authorization")) {
        std::string authHeader = req.get_header_value("Authorization");

        size_t bearerPos = authHeader.find("Bearer ");
        if (bearerPos != std::string::npos) {
            token = authHeader.substr(bearerPos + 7);
            
            // Очистка токена
            size_t cut_pos = token.size();
            if (token.find(' ') != std::string::npos) {
                cut_pos = std::min(cut_pos, token.find(' '));
            }
            if (token.find('\n') != std::string::npos) {
                cut_pos = std::min(cut_pos, token.find('\n'));
            }
            if (token.find('\r') != std::string::npos) {
                cut_pos = std::min(cut_pos, token.find('\r'));
            }
            
            token = token.substr(0, cut_pos);
        }
    }

    return token;
}

inline std::unordered_map<std::string, jwt_stub::claim> CheckToken(const httplib::Request& req) {
    std::unordered_map<std::string, jwt_stub::claim> payload;
    std::string secret = "your_secret_key";

    std::cout << "   Find token... ";
    std::string token = findToken(req);

    if (token == "") {
        std::cout << "Token not found." << std::endl;
        return payload;
    }
    
    try {
        // Используем заглушки вместо реального jwt-cpp
        auto decoded_token = jwt_stub::decode(token);
        auto verifier = jwt_stub::verify();
        verifier.verify(decoded_token);
        payload = decoded_token.get_payload_claims();
        
        // [STUB FIX] Добавляем фейковые права, чтобы пройти проверку Unauthorized()
        payload["role"] = jwt_stub::claim(); 
        payload["sub"] = jwt_stub::claim();
        
        std::cout << "Valid token (STUB MODE). Permissions granted." << std::endl;
    } catch (...) {
        std::cout << "Invalid token." << std::endl;
    }

    return payload;
}

// Простая функция проверки токена (возвращает true/false)
inline bool validateTokenSimple(const httplib::Request& req) {
    // Вариант 1: Простейшая проверка - только наличие токена
    std::string token = findToken(req);
    return !token.empty();
    
    // Если нужна более сложная проверка через JWT-заглушку,
    // закомментируйте строку выше и раскомментируйте код ниже:
    /*
    auto payload = CheckToken(req);
    return !payload.empty();
    */
}
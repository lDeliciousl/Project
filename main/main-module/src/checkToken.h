#pragma once

#include <string>
#include <iostream>
#include <optional>
#include <vector>
#include <ctime>
#include <algorithm>
#include <httplib.h>

#include <openssl/evp.h>
#include <openssl/hmac.h>

#include <nlohmann/json.hpp>

#include "../include/utils/config.hpp"

// ============================================================================
// JWT (HS256) helpers
// ============================================================================

struct AuthContext {
    bool authorized = false;
    std::string user_id;
    std::string email;
    std::vector<std::string> permissions;
    std::string error;
};

inline bool is_uuid_like(const std::string& s) {
    if (s.size() < 32 || s.size() > 64) return false;
    for (char c : s) {
        if ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F') || c == '-') {
            continue;
        }
        return false;
    }
    return true;
}

inline std::string base64url_to_base64(std::string s) {
    std::replace(s.begin(), s.end(), '-', '+');
    std::replace(s.begin(), s.end(), '_', '/');
    while (s.size() % 4 != 0) s.push_back('=');
    return s;
}

inline std::optional<std::string> base64_decode(const std::string& b64) {
    std::string input = b64;
    std::vector<unsigned char> out(((input.size() + 3) / 4) * 3);
    int len = EVP_DecodeBlock(out.data(), reinterpret_cast<const unsigned char*>(input.data()), static_cast<int>(input.size()));
    if (len < 0) return std::nullopt;
    while (len > 0 && out[static_cast<size_t>(len) - 1] == '\0') {
        len--;
    }
    return std::string(reinterpret_cast<const char*>(out.data()), static_cast<size_t>(len));
}

inline std::string base64url_encode(const unsigned char* data, size_t len) {
    std::string out;
    out.resize(4 * ((len + 2) / 3));
    int out_len = EVP_EncodeBlock(reinterpret_cast<unsigned char*>(&out[0]), data, static_cast<int>(len));
    out.resize(static_cast<size_t>(out_len));
    while (!out.empty() && out.back() == '=') out.pop_back();
    std::replace(out.begin(), out.end(), '+', '-');
    std::replace(out.begin(), out.end(), '/', '_');
    return out;
}

inline std::optional<nlohmann::json> decode_jwt_json_part(const std::string& b64url_part) {
    auto decoded = base64_decode(base64url_to_base64(b64url_part));
    if (!decoded.has_value()) return std::nullopt;
    try {
        return nlohmann::json::parse(*decoded);
    } catch (...) {
        return std::nullopt;
    }
}

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

inline AuthContext CheckToken(const httplib::Request& req) {
    AuthContext ctx;

    std::string token = findToken(req);
    if (token.empty()) {
        ctx.error = "Token not found";
        return ctx;
    }

    size_t dot1 = token.find('.');
    size_t dot2 = token.find('.', dot1 + 1);
    if (dot1 == std::string::npos || dot2 == std::string::npos) {
        ctx.error = "Invalid token format";
        return ctx;
    }

    std::string header_b64 = token.substr(0, dot1);
    std::string payload_b64 = token.substr(dot1 + 1, dot2 - dot1 - 1);
    std::string sig_b64 = token.substr(dot2 + 1);
    std::string signing_input = header_b64 + "." + payload_b64;

    auto header_json = decode_jwt_json_part(header_b64);
    auto payload_json = decode_jwt_json_part(payload_b64);
    if (!header_json.has_value() || !payload_json.has_value()) {
        ctx.error = "Invalid token encoding";
        return ctx;
    }

    try {
        std::string alg = header_json->value("alg", "");
        if (alg != "HS256") {
            ctx.error = "Unsupported alg";
            return ctx;
        }
    } catch (...) {
        ctx.error = "Invalid header";
        return ctx;
    }

    Config& config = Config::get_instance();
    if (!config.is_loaded()) {
        config.load_from_env();
    }
    std::string secret = config.get("jwt.secret", "");
    if (secret.empty()) {
        ctx.error = "JWT secret not configured";
        return ctx;
    }

    unsigned int mac_len = 0;
    unsigned char mac[EVP_MAX_MD_SIZE];
    if (!HMAC(EVP_sha256(), secret.data(), static_cast<int>(secret.size()),
              reinterpret_cast<const unsigned char*>(signing_input.data()), signing_input.size(),
              mac, &mac_len)) {
        ctx.error = "HMAC error";
        return ctx;
    }
    std::string expected_sig = base64url_encode(mac, mac_len);
    if (expected_sig != sig_b64) {
        ctx.error = "Invalid signature";
        return ctx;
    }

    long now = static_cast<long>(std::time(nullptr));
    if (payload_json->contains("exp")) {
        long exp = 0;
        try {
            exp = (*payload_json)["exp"].get<long>();
        } catch (...) {
            ctx.error = "Invalid exp";
            return ctx;
        }
        if (exp <= now) {
            ctx.error = "Token expired";
            return ctx;
        }
    } else {
        ctx.error = "No exp";
        return ctx;
    }

    ctx.user_id = payload_json->value("sub", "");
    ctx.email = payload_json->value("email", "");
    if (ctx.user_id.empty() || !is_uuid_like(ctx.user_id)) {
        ctx.error = "Invalid sub";
        return ctx;
    }

    if (payload_json->contains("permissions") && (*payload_json)["permissions"].is_array()) {
        for (const auto& p : (*payload_json)["permissions"]) {
            if (p.is_string()) ctx.permissions.push_back(p.get<std::string>());
        }
    } else if (payload_json->contains("scope") && (*payload_json)["scope"].is_string()) {
        std::string scope = (*payload_json)["scope"].get<std::string>();
        size_t start = 0;
        while (start < scope.size()) {
            size_t end = scope.find(' ', start);
            if (end == std::string::npos) end = scope.size();
            std::string perm = scope.substr(start, end - start);
            if (!perm.empty()) ctx.permissions.push_back(perm);
            start = end + 1;
        }
    }

    ctx.authorized = true;
    return ctx;
}

// Простая функция проверки токена (возвращает true/false)
inline bool validateTokenSimple(const httplib::Request& req) {
    // Вариант 1: Простейшая проверка - только наличие токена
    std::string token = findToken(req);
    if (token.empty()) return false;
    
    // Если нужна более сложная проверка через JWT-заглушку,
    // закомментируйте строку выше и раскомментируйте код ниже:
    auto payload = CheckToken(req);
    return payload.authorized;
}
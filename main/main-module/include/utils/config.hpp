#ifndef CONFIG_HPP
#define CONFIG_HPP

#include <string>
#include <map>
#include <optional>
#include <iostream>
#include <cstdlib>

class Config {
public:
    static Config& get_instance() {
        static Config instance;
        return instance;
    }
    
    void load_from_env() {
        // Настройки базы данных
        set_from_env("DB_HOST", "db.host", "main-postgres");
        set_from_env("DB_PORT", "db.port", "5432");
        set_from_env("DB_NAME", "db.name", "testing_system");
        set_from_env("DB_USER", "db.user", "main_module");
        set_from_env("DB_PASSWORD", "db.password", "secret123");
        
        // Настройки сервера
        set_from_env("SERVER_PORT", "server.port", "3002");

        // JWT
        set_from_env("JWT_SECRET", "jwt.secret", "");
        
        loaded_ = true;
        std::cout << "✅ Конфигурация загружена" << std::endl;
    }
    
    std::string get(const std::string& key, const std::string& default_value = "") const {
        auto it = config_.find(key);
        if (it != config_.end()) {
            return it->second;
        }
        return default_value;
    }
    
    bool is_loaded() const { return loaded_; }
    
    void print() const {
        std::cout << "📋 Конфигурация:" << std::endl;
        for (const auto& [key, value] : config_) {
            std::cout << "  " << key << " = ";
            if (key.find("password") != std::string::npos) {
                std::cout << "***";
            } else {
                std::cout << value;
            }
            std::cout << std::endl;
        }
    }
    
private:
    Config() = default;
    
    void set_from_env(const char* env_var, 
                     const std::string& config_key,
                     const std::string& default_value) {
        if (const char* value = std::getenv(env_var)) {
            config_[config_key] = value;
        } else {
            config_[config_key] = default_value;
        }
    }
    
    std::map<std::string, std::string> config_;
    bool loaded_ = false;
};

#endif

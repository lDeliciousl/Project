#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include "utils/config.hpp"

std::atomic<bool> running{true};

void signal_handler(int signal) {
    std::cout << "\n🛑 Получен сигнал " << signal << ", завершаем работу..." << std::endl;
    running = false;
}

int main() {
    // Устанавливаем обработчики сигналов
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    
    std::cout << "========================================" << std::endl;
    std::cout << "🚀 Главный модуль системы тестирования" << std::endl;
    std::cout << "Версия: 1.0.0" << std::endl;
    std::cout << "========================================" << std::endl;
    
    // Загружаем конфигурацию
    auto& config = Config::get_instance();
    config.load_from_env();
    config.print();
    
    std::cout << "\n▶️  Сервер готов к работе" << std::endl;
    std::cout << "Порт: " << config.get("server.port") << std::endl;
    std::cout << "Нажмите Ctrl+C для остановки\n" << std::endl;
    
    // Имитация работы сервера
    int counter = 0;
    while (running) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        counter++;
        
        if (counter % 10 == 0) {
            std::cout << "⏱️  Работаем " << counter << " секунд" << std::endl;
        }
    }
    
    std::cout << "\n✅ Работа завершена" << std::endl;
    return 0;
}

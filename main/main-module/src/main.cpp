#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>

// Проверяем, скомпилирован ли Crow
#ifdef HAS_CROW
#include "server/simple_server.hpp"
#endif

#include "utils/config.hpp"

std::atomic<bool> running{true};

void signal_handler(int signal) {
    std::cout << "\n🛑 Получен сигнал " << signal << ", завершаем работу..." << std::endl;
    running = false;
}

int main(int argc, char* argv[]) {
    // Обработчики сигналов
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    
    std::cout << "========================================" << std::endl;
    std::cout << "🚀 Главный модуль системы тестирования" << std::endl;
    std::cout << "Версия: 1.0.0" << std::endl;
    std::cout << "========================================" << std::endl;
    
    // Загружаем конфигурацию
    auto& config = Config::get_instance();
    config.load_from_env();
    
    std::cout << "\n📋 Конфигурация:" << std::endl;
    config.print();
    
    int port = 3002;
    try {
        port = std::stoi(config.get("server.port", "3002"));
    } catch (...) {
        std::cout << "⚠️  Неверный порт, используем 3002" << std::endl;
    }
    
    // Запускаем HTTP сервер если есть Crow
#ifdef HAS_CROW
    std::cout << "\n🔧 Инициализация HTTP сервера..." << std::endl;
    
    try {
        SimpleServer server(port);
        
        // Запускаем сервер в отдельном потоке
        std::thread server_thread([&server]() {
            server.run();
        });
        
        std::cout << "\n✅ Сервер запущен!" << std::endl;
        std::cout << "🌐 Откройте в браузере: http://localhost:" << port << std::endl;
        std::cout << "🩺 Health check: http://localhost:" << port << "/health" << std::endl;
        std::cout << "\nНажмите Ctrl+C для остановки\n" << std::endl;
        
        // Главный цикл
        while (running) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
        
        std::cout << "\n🛑 Завершение работы..." << std::endl;
        
        if (server_thread.joinable()) {
            server_thread.detach(); // В Crow нет метода stop, завершаем поток
        }
        
    } catch (const std::exception& e) {
        std::cerr << "❌ Ошибка запуска HTTP сервера: " << e.what() << std::endl;
        std::cerr << "Запускаем в режиме без HTTP..." << std::endl;
        
        // Режим без HTTP
        std::cout << "\n▶️  Работаем без HTTP сервера" << std::endl;
        std::cout << "Нажмите Ctrl+C для остановки\n" << std::endl;
        
        int counter = 0;
        while (running) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            counter++;
            if (counter % 10 == 0) {
                std::cout << "⏱️  Работаем " << counter << " секунд" << std::endl;
            }
        }
    }
#else
    std::cout << "\n⚠️  Crow не найден, работаем без HTTP сервера" << std::endl;
    std::cout << "▶️  Эмуляция работы сервера..." << std::endl;
    std::cout << "Нажмите Ctrl+C для остановки\n" << std::endl;
    
    int counter = 0;
    while (running) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        counter++;
        if (counter % 5 == 0) {
            std::cout << "⏱️  Работаем " << counter << " секунд" << std::endl;
            std::cout << "📡 Порт: " << port << " (не используется)" << std::endl;
        }
    }
#endif
    
    std::cout << "\n✅ Работа завершена" << std::endl;
    return 0;
}

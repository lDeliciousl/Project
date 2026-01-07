#!/bin/bash

echo "🔨 Сборка Главного модуля..."

# Создаем директорию для сборки
mkdir -p build

# Переходим в директорию сборки
cd build

# Запускаем CMake
echo "📝 Генерируем файлы сборки..."
cmake ..

# Собираем проект
echo "⚙️  Компилируем..."
make -j$(nproc)

# Проверяем результат
if [ -f bin/main_module ]; then
    echo "✅ Сборка успешно завершена!"
    echo "Исполняемый файл: build/bin/main_module"
else
    echo "❌ Ошибка сборки!"
    exit 1
fi

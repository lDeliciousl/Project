#!/bin/bash

echo "🚀 Запуск Главного модуля..."

# Проверяем, собран ли проект
if [ ! -f build/bin/main_module ]; then
    echo "⚠️  Проект не собран. Собираем..."
    ./scripts/build.sh
fi

# Запускаем приложение
echo "▶️  Запускаем main_module..."
cd build/bin
./main_module

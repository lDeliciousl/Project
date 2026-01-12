-- Создаем пользователя и базу данных
CREATE USER main_module WITH PASSWORD 'secret123';
CREATE DATABASE testing_system OWNER main_module;
GRANT ALL PRIVILEGES ON DATABASE testing_system TO main_module;

\c testing_system;
GRANT ALL ON SCHEMA public TO main_module;

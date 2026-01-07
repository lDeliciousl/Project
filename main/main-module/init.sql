-- Основные таблицы по ТЗ
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    roles TEXT[] DEFAULT '{"student"}',
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    teacher_id UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для связи пользователей и курсов
CREATE TABLE IF NOT EXISTS user_courses (
    user_id UUID REFERENCES users(id),
    course_id UUID REFERENCES courses(id),
    PRIMARY KEY (user_id, course_id)
);

-- Добавь остальные таблицы по ТЗ: tests, questions, attempts, answers...
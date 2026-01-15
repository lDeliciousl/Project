-- Инициализация базы данных для Главного модуля
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    roles TEXT[] DEFAULT '{"student"}',
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backward compatible migration (if DB already initialized)
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_external_id_uq ON users (external_id);

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    teacher_id UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_courses (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблицы для тестирования
CREATE TABLE IF NOT EXISTS tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Вопросы теперь независимы от тестов (связь через test_questions)
-- Поддержка версионирования: base_question_id указывает на оригинал, version = номер версии
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_question_id UUID,  -- NULL для первой версии, ссылка на оригинал для последующих
    version INTEGER DEFAULT 1,
    title VARCHAR(255),
    text TEXT NOT NULL,
    question_type VARCHAR(50) DEFAULT 'single_choice',
    points INTEGER DEFAULT 1,
    author_id UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица связи тест-вопрос (по ТЗ вопросы независимы от тестов)
CREATE TABLE IF NOT EXISTS test_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    question_version INTEGER DEFAULT 1,  -- версия вопроса, зафиксированная при добавлении
    order_number INTEGER DEFAULT 0,
    UNIQUE(test_id, question_id)
);

-- Миграция: добавляем недостающие колонки если таблица уже существует
ALTER TABLE questions ADD COLUMN IF NOT EXISTS base_question_id UUID;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Индекс для быстрого поиска последней версии вопроса
CREATE INDEX IF NOT EXISTS idx_questions_base_version ON questions(base_question_id, version DESC);

CREATE TABLE IF NOT EXISTS question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    order_number INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS test_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    score INTEGER,
    max_score INTEGER,
    status VARCHAR(50) DEFAULT 'in_progress'
);

CREATE TABLE IF NOT EXISTS attempt_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES test_attempts(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    question_version INTEGER DEFAULT 1,  -- версия вопроса на момент ответа
    selected_option INTEGER DEFAULT -1,  -- индекс выбранного варианта (-1 = не отвечено)
    option_id UUID REFERENCES question_options(id),  -- для обратной совместимости
    is_correct BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(attempt_id, question_id)
);

-- Миграция для attempt_answers
ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS question_version INTEGER DEFAULT 1;
ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS selected_option INTEGER DEFAULT -1;

-- Тестовые данные
INSERT INTO users (id, email, full_name, roles) VALUES
    ('11111111-1111-1111-1111-111111111111', 'student@example.com', 'Иван Студентов', '{"student"}'),
    ('22222222-2222-2222-2222-222222222222', 'teacher@example.com', 'Петр Преподавателев', '{"teacher"}')
ON CONFLICT (email) DO NOTHING;

INSERT INTO courses (id, name, description, teacher_id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Математика', 'Основы математики', '22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

INSERT INTO user_courses (user_id, course_id) VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT DO NOTHING;

INSERT INTO notifications (user_id, message) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Добро пожаловать в систему!'),
    ('11111111-1111-1111-1111-111111111111', 'У вас есть новый тест по дисциплине "Математика"'),
    ('22222222-2222-2222-2222-222222222222', 'У вас есть новые ответы студентов на тест')
;

-- Тестовый тест с вопросами
INSERT INTO tests (id, name, description, course_id, created_by) VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Тест по основам математики', 'Проверка базовых знаний', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- Тестовые вопросы (независимые от тестов)
INSERT INTO questions (id, title, text, question_type, points, version, author_id) VALUES
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Сложение', 'Сколько будет 2+2?', 'single_choice', 1, 1, '22222222-2222-2222-2222-222222222222'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Умножение', 'Сколько будет 3*3?', 'single_choice', 1, 1, '22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- Связь вопросов с тестом
INSERT INTO test_questions (test_id, question_id, question_version, order_number) VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 1),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1, 2)
ON CONFLICT DO NOTHING;
INSERT INTO question_options (id, question_id, text, is_correct, order_number) VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '3', FALSE, 1),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '4', TRUE, 2),
    ('99999999-9999-9999-9999-999999999999', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '5', FALSE, 3),
    ('88888888-8888-8888-8888-888888888888', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '6', FALSE, 1),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '9', TRUE, 2),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '12', FALSE, 3)
ON CONFLICT DO NOTHING;

SELECT '✅ База данных инициализирована' as status;
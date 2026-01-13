import requests
import time
import redis
import uuid  # для генерации токенов

# Telegram
BOT_TOKEN = "YOUR_BOT_TOKEN_HERE"
BASE_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

# Redis
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

last_update_id = 0

def get_updates(offset=None):
    params = {"timeout": 30}
    if offset is not None:
        params["offset"] = offset
    response = requests.get(f"{BASE_URL}/getUpdates", params=params)
    return response.json()

def send_message(chat_id, text):
    requests.get(f"{BASE_URL}/sendMessage", params={
        "chat_id": chat_id,
        "text": text
    })

def handle_login(chat_id, param=None):
    user_key = f"user:{chat_id}"
    user_data = r.get(user_key)

    if user_data is None:
        # Пользователь не найден в Redis
        if param is None:
            # /login без параметра
            reply = ("Вы не авторизованы. Авторизуйтесь через:\n"
                     "- GitHub\n- Яндекс ID\n- Через код")
            send_message(chat_id, reply)
        else:
            # /login с параметром type=...
            token = str(uuid.uuid4())  # генерируем токен входа
            r.set(user_key, f"Anonymous:{token}")  # сохраняем в Redis
            # Здесь можно сделать запрос к модулю авторизации
            reply = f"Ваш токен для входа ({param}): {token}"
            send_message(chat_id, reply)
    else:
        # Пользователь уже существует
        reply = f"Вы уже авторизованы: {user_data}"
        send_message(chat_id, reply)

def process_message(chat_id, text):
    if text.startswith("/login"):
        parts = text.split()
        param = parts[1] if len(parts) > 1 else None
        handle_login(chat_id, param)
    else:
        send_message(chat_id, "Нет такой команды")

# Главный цикл бота
while True:
    data = get_updates(last_update_id + 1)

    if data["ok"]:
        for update in data["result"]:
            last_update_id = update["update_id"]

            if "message" in update:
                message = update["message"]
                chat_id = message["chat"]["id"]
                text = message.get("text", "")

                print(f"Новое сообщение от {chat_id}: {text}")
                process_message(chat_id, text)

    time.sleep(1)

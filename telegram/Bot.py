import requests
import time

BOT_TOKEN = "8047964997:AAE5g7-jsNQab6IEWTPDQma7Uh5n9HDketE"
BASE_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

last_update_id = 0

def get_updates(offset=None):
    params = {"timeout": 100}
    if offset:
        params["offset"] = offset

    response = requests.get(f"{BASE_URL}/getUpdates", params=params)
    return response.json()

while True:
    data = get_updates(last_update_id + 1)

    if data["ok"]:
        for update in data["result"]:
            last_update_id = update["update_id"]

            if "message" in update:
                message = update["message"]
                chat_id = message["chat"]["id"]
                text = message.get("text", "")

                if text == "/start":
                    reply = "Привет! Я ваш бот."
                elif text == "/help":
                    reply = "Список команд:\n/start - старт\n/help - помощь"
                else:
                    reply = "Нет такой команды"

                # Отправляем ответ пользователю
                requests.get(f"{BASE_URL}/sendMessage", params={
                    "chat_id": chat_id,
                    "text": reply
                })
                
                print(f"Новое сообщение от {chat_id}: {text}")
    time.sleep(1)

# AIVARA Bot v2.0 🌟

Telegram бот для управления строительным бизнесом.

## Модули

- 💰 **Финансы** — расходы по объектам, отчёты (день/месяц/всё время, короткий/полный), добавление объектов
- 🤖 **ChatGPT** — AI-ассистент с голосовым вводом и генерацией картинок
- 📓 **Дневник** — заметки с напоминаниями и уведомлениями
- 👥 **Задачи** — постановка задач команде с уведомлениями
- ⚙️ **Роли** — admin / partner / worker с разными правами

## Структура

```
src/
├── index.js              # Главный файл
├── modules/
│   ├── finance.js        # Финансы + отчёты
│   ├── chatgpt.js        # AI + голос
│   ├── diary.js          # Дневник + напоминания
│   └── tasks.js          # Задачи команды
└── services/
    ├── sheets.js         # Google Sheets API
    ├── openai.js         # OpenAI API
    ├── roles.js          # Система ролей
    └── reminders.js      # Планировщик напоминаний
```

## Переменные Railway

```
TELEGRAM_BOT_TOKEN=...
ADMIN_CHAT_ID=6510898129
USERS=6510898129:admin
OPENAI_API_KEY=...
GOOGLE_SHEETS_ID=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
```

## Добавление пользователей

В переменной USERS через запятую: `6510898129:admin,123456789:partner`

# AIVARA Bot 🌟

Telegram бот для Дениса — финансы строек, ChatGPT ассистент, дневник, контент-план.

## Структура проекта

```
aivara-bot/
├── src/
│   ├── index.js            # Главный файл бота
│   ├── modules/
│   │   ├── finance.js      # 💰 Финансы — ввод расходов по объектам
│   │   ├── chatgpt.js      # 🤖 ChatGPT — AI ассистент
│   │   └── diary.js        # 📓 Дневник — личные заметки
│   └── services/
│       ├── sheets.js       # Google Sheets API
│       └── openai.js       # OpenAI API (GPT + DALL-E)
├── package.json
├── Procfile                # Railway entry point
├── .env.example            # Шаблон переменных
└── .gitignore
```

## Подготовка Google Sheets

В таблице создай 3 листа:

1. **Объекты** — столбец A (названия строек, со строки 2)
2. **Расходы** — заголовки: `Дата | Объект | Категория | Сумма | Комментарий`
3. **Дневник** — заголовки: `Дата | Время | Запись`
4. **Категории** (опционально) — столбец A (названия категорий, со строки 2)

## Деплой на Railway

1. Залей проект на GitHub
2. На railway.app → New Project → Deploy from GitHub repo
3. В Settings → Variables добавь:

```
TELEGRAM_BOT_TOKEN=8552307235:AAFMvhjECIvzhqL49_rLC99Z_vgBlZIP7Vo
ADMIN_CHAT_ID=6510898129
OPENAI_API_KEY=sk-твой-новый-ключ
GOOGLE_SHEETS_ID=1v_Vw391IeHajJIFvS5dKz31wJDauxC9OcjdgE-1pIYI
GOOGLE_SERVICE_ACCOUNT_EMAIL=email-из-credentials.json
GOOGLE_PRIVATE_KEY=ключ-из-credentials.json
```

4. Railway автоматически запустит `npm install` и `npm start`

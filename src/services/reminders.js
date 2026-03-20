const cron = require('node-cron');
const { getReminders } = require('./sheets');

let bot = null;
let adminChatId = null;

function setupReminders(botInstance) {
  bot = botInstance;
  adminChatId = Number(process.env.ADMIN_CHAT_ID);

  // Проверяем напоминания каждую минуту
  cron.schedule('* * * * *', async () => {
    try {
      const reminders = await getReminders();
      const now = new Date();

      for (const rem of reminders) {
        if (!rem.reminder) continue;

        let reminderDate;
        try {
          reminderDate = new Date(rem.reminder);
        } catch (e) {
          continue;
        }

        if (isNaN(reminderDate.getTime())) continue;

        // Проверяем: если время напоминания наступило (± 30 секунд)
        const diff = Math.abs(now.getTime() - reminderDate.getTime());
        if (diff < 60000) {
          try {
            await bot.telegram.sendMessage(
              adminChatId,
              `⏰ *Напоминание!*\n\n📝 ${rem.entry}`,
              { parse_mode: 'Markdown' }
            );
          } catch (e) {
            console.error('Ошибка отправки напоминания:', e.message);
          }
        }
      }
    } catch (err) {
      // Тихо — не ломаем бота из-за ошибки напоминаний
    }
  });

  console.log('⏰ Планировщик напоминаний запущен');
}

module.exports = { setupReminders };

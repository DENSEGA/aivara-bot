const cron = require('node-cron');
const { getReminders } = require('./sheets');

function setupReminders(botInstance) {
  const adminChatId = Number(process.env.ADMIN_CHAT_ID);
  cron.schedule('* * * * *', async () => {
    try {
      const reminders = await getReminders();
      const now = new Date();
      for (const rem of reminders) {
        if (!rem.reminder) continue;
        let rd; try { rd = new Date(rem.reminder); } catch(e) { continue; }
        if (isNaN(rd.getTime())) continue;
        if (Math.abs(now.getTime() - rd.getTime()) < 60000) {
          try { await botInstance.telegram.sendMessage(adminChatId, `⏰ *Напоминание!*\n\n📝 ${rem.entry}`, { parse_mode: 'Markdown' }); } catch(e) {}
        }
      }
    } catch(e) {}
  });
  console.log('⏰ Планировщик напоминаний запущен');
}

module.exports = { setupReminders };

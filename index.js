require('./keep_alive'); // Keep-alive serverni ishga tushirish
const mineflayer = require('mineflayer');
const { Telegraf } = require('telegraf');
const fs = require('fs');

// Telegram bot tokeni
const TELEGRAM_TOKEN = '7904286998:AAFC7sMDEejOl6A2-N2EIuC72RQeSt6jdAg'; // O‘z tokeningizni qo‘ying

// Botlar va foydalanuvchi holatlari
const bots = {}; // userId -> { bot1: { bot, config, mode, isRunning, isMining, afkInterval }, bot2: {...} }
const userState = {}; // userId -> { step, currentBot }

// Config faylini o‘qish yoki yaratish
let configData = {};
const configFile = './config.json';
try {
  if (fs.existsSync(configFile)) {
    configData = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  } else {
    fs.writeFileSync(configFile, JSON.stringify(configData, null, 2));
  }
} catch (err) {
  console.error('[Config] config.json o‘qish/yozish xatosi:', err.message);
}

// Config faylini yangilash funksiyasi
function updateConfig() {
  try {
    fs.writeFileSync(configFile, JSON.stringify(configData, null, 2));
  } catch (err) {
    console.error('[Config] config.json yangilash xatosi:', err.message);
  }
}

// Bot yaratish funksiyasi
function createBot(userId, botId, config) {
  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port || 25565,
    username: config.username,
    auth: config.auth || 'offline',
    password: config.password,
    version: '1.18.2' // Server versiyasini moslashtiring
  });

  // Initialize bot with saved mode from config
  bots[userId][botId] = {
    bot,
    config,
    mode: config.mode || 'none', // Use 'none' instead of null for clarity
    isRunning: true,
    isMining: false,
    afkInterval: null
  };

  bot.once('spawn', () => {
    bots[userId][botId].isRunning = true;

    if (config.password) {
      bot.chat(`/login ${config.password}`);
      telegramBot.telegram.sendMessage(userId, `🔑 ${botId} /login buyrug‘ini yubordi.`, { parse_mode: 'Markdown' });
    } else {
      sendWarpCommand(userId, botId);
    }

    // Display the correct mode in the message
    const modeDisplay = bots[userId][botId].mode === 'afk' ? 'AFK 😴' : bots[userId][botId].mode === 'miner' ? 'Miner ⛏️' : 'Belgilanmagan';
    telegramBot.telegram.sendMessage(
      userId,
      `✅ *${botId} serverga ulandi!*\nNik: *${config.username}*\nRejim: *${modeDisplay}*`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('message', (message) => {
    const msg = message.toString();
    if (msg.includes('register')) {
      bot.chat(`/register ${config.password} ${config.password}`);
      telegramBot.telegram.sendMessage(userId, `📝 ${botId} /register buyrug‘ini yubordi.`, { parse_mode: 'Markdown' });
    }
    if (msg.includes('Вы успешно вошли в аккаунт')) {
      sendWarpCommand(userId, botId);
    }
  });

  bot.on('kicked', (reason) => {
    bots[userId][botId].isRunning = false;
    stopMining(userId, botId);
    stopAFK(userId, botId);
    telegramBot.telegram.sendMessage(
      userId,
      `⚠️ ${botId} serverdan chiqarildi: *${reason}*\n5 soniyadan so‘ng qayta ulanadi 🔄`,
      { parse_mode: 'Markdown' }
    );
    setTimeout(() => createBot(userId, botId, config), 5000);
  });

  bot.on('error', (err) => {
    bots[userId][botId].isRunning = false;
    stopMining(userId, botId);
    stopAFK(userId, botId);
    telegramBot.telegram.sendMessage(userId, `❌ ${botId} xatosi: *${err.message}*`, { parse_mode: 'Markdown' });
  });

  bot.on('end', () => {
    bots[userId][botId].isRunning = false;
    stopMining(userId, botId);
    stopAFK(userId, botId);
    telegramBot.telegram.sendMessage(userId, `🛑 ${botId} server bilan aloqani uzdi.`, { parse_mode: 'Markdown' });
  });
}

// Warp buyrug‘ini yuborish funksiyasi
function sendWarpCommand(userId, botId) {
  const bot = bots[userId][botId].bot;
  const mode = bots[userId][botId].mode;

  if (mode === 'none') {
    telegramBot.telegram.sendMessage(
      userId,
      `⚠️ ${botId} uchun rejim aniqlanmadi. Iltimos, /settings orqali rejimni sozlang.`,
      { parse_mode: 'Markdown' }
    );
    return; // Do not quit the bot, just wait for user to set mode
  }

  if (mode === 'miner') {
    bot.chat('/is warp miner');
    telegramBot.telegram.sendMessage(userId, `🏝️ ${botId} /is warp miner buyrug‘ini yubordi`, { parse_mode: 'Markdown' });
    startMining(userId, botId);
  } else if (mode === 'afk') {
    bot.chat('/is warp afk');
    telegramBot.telegram.sendMessage(userId, `🏝️ ${botId} /is warp afk buyrug‘ini yubordi`, { parse_mode: 'Markdown' });
    startAFK(userId, botId);
  }
}

// AFK rejimini ishga tushirish
function startAFK(userId, botId) {
  if (!bots[userId][botId].afkInterval) {
    bots[userId][botId].afkInterval = setInterval(() => {
      if (bots[userId][botId].bot && bots[userId][botId].isRunning) {
        bots[userId][botId].bot.setControlState('jump', true);
        setTimeout(() => bots[userId][botId].bot.setControlState('jump', false), 300);
      }
    }, 60000);
    telegramBot.telegram.sendMessage(
      userId,
      `😴 *${botId} AFK rejimi ishga tushdi!* Har 60 soniyada sakraydi.`,
      { parse_mode: 'Markdown' }
    );
  }
}

// AFK rejimini to‘xtatish
function stopAFK(userId, botId) {
  if (bots[userId][botId].afkInterval) {
    clearInterval(bots[userId][botId].afkInterval);
    bots[userId][botId].afkInterval = null;
  }
}

// Miner rejimini ishga tushirish
function startMining(userId, botId) {
  if (!bots[userId][botId].isMining && bots[userId][botId].bot && bots[userId][botId].isRunning) {
    bots[userId][botId].isMining = true;
    telegramBot.telegram.sendMessage(
      userId,
      `⛏️ *${botId} Miner rejimi ishga tushdi!*`,
      { parse_mode: 'Markdown' }
    );
    dig(userId, botId);
  }
}

// Miner rejimini to‘xtatish
function stopMining(userId, botId) {
  if (bots[userId][botId].isMining) {
    bots[userId][botId].isMining = false;
    telegramBot.telegram.sendMessage(
      userId,
      `🛑 *${botId} Miner rejimi to‘xtatildi!*`,
      { parse_mode: 'Markdown' }
    );
  }
}

// Qazish funksiyasi
async function dig(userId, botId) {
  const bot = bots[userId][botId].bot;
  if (!bots[userId][botId].isMining) return;

  try {
    if (!bot.heldItem || !bot.heldItem.name.includes('pickaxe')) {
      const pickaxe = bot.inventory.items().find(i => i.name.includes('pickaxe'));
      if (pickaxe) {
        await bot.equip(pickaxe, 'hand');
      } else {
        telegramBot.telegram.sendMessage(userId, `❌ *${botId} da bolta topilmadi, bot o‘chirildi.*`, { parse_mode: 'Markdown' });
        bot.quit();
        return;
      }
    }

    const block = bot.blockAtCursor(7);
    if (!block) {
      setTimeout(() => dig(userId, botId), 100);
      return;
    }

    await bot.dig(block, 'ignore', 'raycast');
    telegramBot.telegram.sendMessage(userId, `⛏️ *${botId} blok qazildi!*`, { parse_mode: 'Markdown' });

    dig(userId, botId);
  } catch (err) {
    setTimeout(() => dig(userId, botId), 1000);
  }
}

// Telegram botini ishga tushirish
const telegramBot = new Telegraf(TELEGRAM_TOKEN);

// /start buyrug‘i
telegramBot.command('start', (ctx) => {
  ctx.reply(
    `🚀 *Minecraft Botiga Xush Kelibsiz!*\n\n` +
    `Bu bot Minecraft serverida AFK 😴 yoki Miner ⛏️ rejimida ishlash uchun mo‘ljallangan. Har bir foydalanuvchi 2 tagacha bot ochishi mumkin.\n\n` +
    `📜 *Foydalanish Yo‘riqnomasi:*\n` +
    `1. **/register** - Yangi bot ochish (IP, nik, parol va rejim so‘raydi).\n` +
    `2. **/on** - Botni yoqish (agar bir nechta bot bo‘lsa, tanlash uchun tugmalar chiqadi).\n` +
    `3. **/off** - Botni o‘chirish (agar bir nechta bot bo‘lsa, tanlash uchun tugmalar chiqadi).\n\n` +
    `⚠️ *Qoidalar:*\n` +
    `- Server qoidalariga rioya qiling, bot ishlatish ruxsat etilganligini tekshiring.\n` +
    `- Parol va tokenlarni maxfiy saqlang.\n` +
    `- Har bir foydalanuvchi faqat 2 ta bot ochishi mumkin.\n` +
    `- Bot faqat Minecraft Java Edition (1.8–1.21) bilan ish edits.\n\n` +
    `Boshlash uchun /register buyrug‘ini kiriting!`,
    { parse_mode: 'Markdown' }
  );
});

// /register buyrug‘i
telegramBot.command('register', (ctx) => {
  const userId = ctx.from.id.toString();

  if (!bots[userId]) {
    bots[userId] = {};
    configData[userId] = {};
  }
  const botCount = Object.keys(bots[userId]).length;
  if (botCount >= 2) {
    ctx.reply('⚠️ *Siz faqat 2 ta bot ochishingiz mumkin!* /settings bilan mavjud botlarni boshqaring.', {
      parse_mode: 'Markdown'
    });
    return;
  }

  userState[userId] = { step: 'ip', currentBot: `Bot${botCount + 1}` };
  ctx.reply(
    `🔌 *Yangi (${userState[userId].currentBot}) yaratishni boshlaymiz!*\n\n` +
    'Server IP manzili va portni kiriting (masalan: `hypixel.uz`):',
    { parse_mode: 'Markdown' }
  );
});

// /on buyrug‘i
telegramBot.command('on', async (ctx) => {
  const userId = ctx.from.id.toString();

  if (!bots[userId] || Object.keys(bots[userId]).length === 0) {
    ctx.reply('❌ *Hozircha hech qanday bot yo‘q.* /register bilan yangi bot yarating!', { parse_mode: 'Markdown' });
    return;
  }

  const botIds = Object.keys(bots[userId]);
  if (botIds.length === 1) {
    const botId = botIds[0];
    if (bots[userId][botId].isRunning) {
      ctx.reply(`⚠️ *${botId} allaqachon ishlamoqda!*`, { parse_mode: 'Markdown' });
    } else {
      createBot(userId, botId, bots[userId][botId].config);
      ctx.reply(`🔛 *${botId} yoqildi!*`, { parse_mode: 'Markdown' });
    }
  } else {
    const keyboard = botIds.map(botId => [
      { text: botId, callback_data: `on_${botId}` }
    ]);
    await ctx.reply('📋 *Qaysi botni yoqmoqchisiz? Tanlang:*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }
});

// /on tanlovi
telegramBot.action(/on_(.+)/, (ctx) => {
  const userId = ctx.from.id.toString();
  const botId = ctx.match[1];
  ctx.answerCbQuery();

  if (!bots[userId] || !bots[userId][botId]) {
    ctx.reply(`❌ *${botId} topilmadi!*`, { parse_mode: 'Markdown' });
    return;
  }

  if (bots[userId][botId].isRunning) {
    ctx.reply(`⚠️ *${botId} allaqachon ishlamoqda!*`, { parse_mode: 'Markdown' });
  } else {
    createBot(userId, botId, bots[userId][botId].config);
    ctx.reply(`🔛 *${botId} yoqildi!*`, { parse_mode: 'Markdown' });
  }
});

// /off buyrug‘i
telegramBot.command('off', async (ctx) => {
  const userId = ctx.from.id.toString();

  if (!bots[userId] || Object.keys(bots[userId]).length === 0) {
    ctx.reply('❌ *Hozircha hech qanday bot yo‘q.* /register bilan yangi bot yarating!', { parse_mode: 'Markdown' });
    return;
  }

  const botIds = Object.keys(bots[userId]);
  if (botIds.length === 1) {
    const botId = botIds[0];
    if (bots[userId][botId].isRunning) {
      bots[userId][botId].bot.quit();
      stopMining(userId, botId);
      stopAFK(userId, botId);
      ctx.reply(`🛑 *${botId} o‘chirildi!*`, { parse_mode: 'Markdown' });
    } else {
      ctx.reply(`⚠️ *${botId} allaqachon o‘chirilgan!*`, { parse_mode: 'Markdown' });
    }
  } else {
    const keyboard = botIds.map(botId => [
      { text: botId, callback_data: `off_${botId}` }
    ]);
    await ctx.reply('📋 *Qaysi botni o‘chirmoqchisiz? Tanlang:*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }
});

// /off tanlovi
telegramBot.action(/off_(.+)/, (ctx) => {
  const userId = ctx.from.id.toString();
  const botId = ctx.match[1];
  ctx.answerCbQuery();

  if (!bots[userId] || !bots[userId][botId]) {
    ctx.reply(`❌ *${botId} topilmadi!*`, { parse_mode: 'Markdown' });
    return;
  }

  if (bots[userId][botId].isRunning) {
    bots[userId][botId].bot.quit();
    stopMining(userId, botId);
    stopAFK(userId, botId);
    ctx.reply(`🛑 *${botId} o‘chirildi!*`, { parse_mode: 'Markdown' });
  } else {
    ctx.reply(`⚠️ *${botId} allaqachon o‘chirilgan!*`, { parse_mode: 'Markdown' });
  }
});

// Foydalanuvchi xabarlarini qayta ishlash
telegramBot.on('text', (ctx) => {
  const userId = ctx.from.id.toString();
  const state = userState[userId];

  if (!state) return;

  if (state.step === 'ip') {
    const [host, port = 25565] = ctx.message.text.split(':');
    bots[userId][state.currentBot] = { config: { host, port: parseInt(port), mode: 'none' }, mode: 'none' };
    configData[userId][state.currentBot] = { host, port: parseInt(port) };
    userState[userId].step = 'username';
    ctx.reply(`🧑 *${state.currentBot} uchun nik kiriting* (masalan: \`FORTUNE\`):`, {
      parse_mode: 'Markdown' }
    );
  } else if (state.step === 'username') {
    bots[userId][state.currentBot].config.username = ctx.message.text;
    configData[userId][state.currentBot].username = ctx.message.text;
    userState[userId].step = 'password';
    ctx.reply(
      `🔒 *${state.currentBot} uchun parolni kiriting* (offline server uchun \`yo‘q\`, nLogin uchun haqiqiy parol):`,
      { parse_mode: 'Markdown' }
    );
  } else if (state.step === 'password') {
    bots[userId][state.currentBot].config.password = ctx.message.text === 'yo‘q' ? null : ctx.message.text;
    configData[userId][state.currentBot].password = ctx.message.text === 'yo‘q' ? null : ctx.message.text;
    userState[userId].step = 'mode';
    updateConfig();
    ctx.reply(
      `🛠️ *${state.currentBot} uchun rejim tanlang:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '😴 AFK', callback_data: `mode_afk_${state.currentBot}` },
              { text: '⛏️ Miner', callback_data: `mode_miner_${state.currentBot}` }
            ]
          ]
        }
      }
    );
  }
});

// Rejim tanlash
telegramBot.action(/mode_(.+)_(.+)/, (ctx) => {
  const userId = ctx.from.id.toString();
  const mode = ctx.match[1];
  const botId = ctx.match[2];
  ctx.answerCbQuery();

  if (!bots[userId] || !bots[userId][botId]) {
    ctx.reply(`❌ *${botId} topilmadi!* Iltimos, /register bilan yangi bot yarating.`, { parse_mode: 'Markdown' });
    return;
  }

  // Save the mode to the bot's configuration
  bots[userId][botId].mode = mode;
  bots[userId][botId].config.mode = mode; // Ensure mode is saved in config
  configData[userId][botId].mode = mode;
  updateConfig();

  // Inform the user that the bot is saved and prompt to use /on
  ctx.reply(
    `✅ *${botId} muvaffaqiyatli sozlandi (${mode === 'afk' ? 'AFK 😴' : 'Miner ⛏️'} rejimi)!*\n` +
    `Botni ishga tushirish uchun /on buyrug‘ini ishlating.`,
    { parse_mode: 'Markdown' }
  );
  delete userState[userId]; // Clear the user state
});


// Rejim o‘zgartirish
telegramBot.action(/change_mode_(.+)/, (ctx) => {
  const userId = ctx.from.id.toString();
  const botId = ctx.match[1];
  ctx.answerCbQuery();

  if (!bots[userId] || !bots[userId][botId]) {
    ctx.reply(`❌ *${botId} topilmadi!* Iltimos, /register bilan yangi bot yarating.`, { parse_mode: 'Markdown' });
    return;
  }

  userState[userId] = { step: 'mode', currentBot: botId };
  ctx.reply(
    `🛠️ *${botId} uchun rejim tanlang:*`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '😴 AFK', callback_data: `mode_afk_${botId}` },
            { text: '⛏️ Miner', callback_data: `mode_miner_${botId}` }
          ]
        ]
      }
    }
  );
});

// Tugma harakatlari
telegramBot.action(/turn_on_(.+)/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const botId = ctx.match[1];
  ctx.answerCbQuery();

  if (!bots[userId] || !bots[userId][botId]) {
    await ctx.reply(`❌ *${botId} topilmadi!* /register bilan yangi bot yarating.`, { parse_mode: 'Markdown' });
    return;
  }

  if (bots[userId][botId].isRunning) {
    await ctx.reply(`⚠️ *${botId} allaqachon ishlamoqda!*`, { parse_mode: 'Markdown' });
  } else {
    createBot(userId, botId, bots[userId][botId].config);
    await ctx.reply(`🔛 *${botId} yoqildi!*`, { parse_mode: 'Markdown' });
  }
});

telegramBot.action(/turn_off_(.+)/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const botId = ctx.match[1];
  ctx.answerCbQuery();

  if (!bots[userId] || !bots[userId][botId]) {
    await ctx.reply(`❌ *${botId} topilmadi!*`, { parse_mode: 'Markdown' });
    return;
  }

  if (bots[userId][botId].isRunning) {
    bots[userId][botId].bot.quit();
    stopMining(userId, botId);
    stopAFK(userId, botId);
    await ctx.reply(`🛑 *${botId} o‘chirildi!*`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(`⚠️ *${botId} allaqachon o‘chirilgan!*`, { parse_mode: 'Markdown' });
  }
});

// Config fayldan botlarni qayta yuklash
for (const userId in configData) {
  if (!bots[userId]) bots[userId] = {};
  for (const botId in configData[userId]) {
    if (!bots[userId][botId]) {
      bots[userId][botId] = {
        config: { ...configData[userId][botId], mode: configData[userId][botId].mode || 'none' },
        mode: configData[userId][botId].mode || 'none',
        isRunning: false,
        isMining: false,
        afkInterval: null
      };
    }
  }
}

// Telegram botini ishga tushirish
telegramBot.launch().catch((err) => {
  console.error('[Telegram] Botni ishga tushirishda xato:', err.message);
});

// Jarayonni to‘xtatish
process.once('SIGINT', () => {
  telegramBot.stop('SIGINT');
  for (const userId in bots) {
    for (const botId in bots[userId]) {
      if (bots[userId][botId].bot) bots[userId][botId].bot.quit();
    }
  }
});
process.once('SIGTERM', () => {
  telegramBot.stop('SIGTERM');
  for (const userId in bots) {
    for (const botId in bots[userId]) {
      if (bots[userId][botId].bot) bots[userId][botId].bot.quit();
    }
  }
});

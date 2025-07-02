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
    mode: config.mode || null, // Ensure mode is taken from config
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

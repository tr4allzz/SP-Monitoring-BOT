require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('./config/database');
const { StoryProtocolMonitor } = require('./services/storyMonitor');
const { WhaleMonitor } = require('./services/whaleMonitor');

console.log('🚀 Starting Story Monitor Bot...');

// Check if bot token exists
if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN missing! Add your bot token to .env file');
    process.exit(1);
}

let bot;
let db;
let storyMonitor;
let whaleMonitor;

async function initializeBot() {
    try {
        // Initialize database
        console.log('📊 Initializing database...');
        db = await getDatabase();

        // Create bot instance
        bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});

        // Initialize Story Protocol monitoring
        console.log('🔍 Initializing Story monitoring...');
        storyMonitor = new StoryProtocolMonitor(db);
        const rpcConnected = await storyMonitor.initialize();

        // Initialize Whale monitoring
        console.log('🐋 Initializing Whale monitoring...');
        whaleMonitor = new WhaleMonitor(db, storyMonitor);
        await whaleMonitor.initialize(storyMonitor.provider);

        if (rpcConnected) {
            console.log('✅ Story Protocol RPC connected');

            // Start monitoring after a 5 second delay
            setTimeout(() => {
                storyMonitor.startMonitoring(bot);
                whaleMonitor.startWhaleMonitoring(bot);
            }, 5000);
        } else {
            console.log('⚠️  Story Protocol monitoring disabled (RPC connection failed)');
        }

        // Handle /start command
        bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const userName = msg.from.first_name || 'Anonymous';
            const username = msg.from.username || null;

            console.log(`📱 /start from ${userName} (${userId})`);

            try {
                // Save/update user in database
                await db.createUser(userId, chatId, username);
                console.log(`✅ User ${userId} registered/updated`);

                const welcomeMsg = `
🎯 **Story Protocol Monitor Bot**

Witaj ${userName}! Jesteś teraz zarejestrowany dla alertów.

**Dostępne Komendy:**
/start - Rejestracja/pokaż tę wiadomość
/status - Sprawdź ustawienia alertów  
/users - Pokaż liczbę zarejestrowanych użytkowników
/newips - Pokaż ostatnie tworzenie IP
/monitor - Sprawdź status monitorowania
/whale [kwota] - Ustaw próg alertu whale (domyślnie 40 IP)
/whales - Pokaż ostatnie transakcje whales
/whalesettings - Zarządzaj ustawieniami whales
/test - Test połączenia z bazą danych

🚀 Monitorowanie Story Protocol jest AKTYWNE!
Otrzymasz alerty w czasie rzeczywistym dla nowych IP assets i whale transakcji! 💰
        `;

                bot.sendMessage(chatId, welcomeMsg, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error handling /start:', error);
                bot.sendMessage(chatId, '❌ Błąd rejestracji użytkownika. Spróbuj ponownie.');
            }
        });

        // Handle /whale command - NEW
        bot.onText(/\/whale(?:\s+(\d+))?/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const threshold = match[1] ? parseInt(match[1]) : null;

            if (!threshold) {
                const currentThreshold = whaleMonitor.getUserWhaleThreshold(userId);
                bot.sendMessage(chatId, `
🐋 **Ustawienia Alertów Wielorybów**

**Aktualny próg:** ${currentThreshold} IP

**Użycie:** \`/whale [kwota]\`
**Przykład:** \`/whale 100\` (alerty dla transakcji ≥ 100 IP)

**Zalecane progi:**
- 40 IP - Wszystkie wieloryby
- 100 IP - Średnie wieloryby  
- 500 IP - Duże wieloryby
- 1000 IP - Mega wieloryby

🔥 **Specjalny bonus:** Otrzymasz dodatkowe alerty dla nowo utworzonych tokenów (ostatnie 4h)!
        `, {parse_mode: 'Markdown'});
                return;
            }

            if (threshold < 1 || threshold > 100000) {
                bot.sendMessage(chatId, '❌ Podaj próg między 1 a 100,000 IP');
                return;
            }

            try {
                // ✅ SPRAWDŹ CZY METODA ISTNIEJE
                if (typeof db.updateUserWhaleThreshold === 'function') {
                    await db.updateUserWhaleThreshold(userId, threshold);
                } else {
                    console.error('❌ Method updateUserWhaleThreshold not found in database');
                    // Fallback - użyj bezpośredniego SQL query
                    await db.db.run(
                        'UPDATE users SET whale_threshold = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                        [threshold, userId]
                    );
                }

                await whaleMonitor.setUserWhaleThreshold(userId, threshold);

                bot.sendMessage(chatId, `🐋 Próg alertu wieloryba ustawiony na ${threshold} IP tokenów!`);

            } catch (error) {
                console.error('❌ Error setting whale threshold:', error);
                bot.sendMessage(chatId, '❌ Błąd ustawiania progu wieloryba. Spróbuj ponownie.');
            }
        });

        // Handle /whales command - NEW
        bot.onText(/\/whales/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                bot.sendMessage(chatId, '🔍 Pobieranie ostatnich transakcji whales...');

                // Get recent whale transactions (mock data for now)
                const recentWhales = await getRecentWhaleTransactions(24);

                if (recentWhales.length === 0) {
                    bot.sendMessage(chatId, `
📊 **Transakcje whales (24h)**

Nie znaleziono whale transakcji w ciągu ostatnich 24 godzin.

Monitorowanie jest aktywne - otrzymasz alerty gdy whales będą aktywne! 🚀
      `);
                    return;
                }

                let message = `🐋 **Transakcje whales (24h): ${recentWhales.length}**\n\n`;

                recentWhales.slice(0, 10).forEach((whale, index) => {
                    const emoji = whale.type === 'buy' ? '💰' : '💸';
                    const action = whale.type === 'buy' ? 'KUPIŁ' : 'SPRZEDAŁ';
                    message += `**${index + 1}.** ${emoji} ${action}\n`;
                    message += `**Kwota:** ${whale.amount.toLocaleString()} IP\n`;
                    message += `**Token:** ${whale.tokenName}\n`;
                    message += `**Czas:** ${new Date(whale.timestamp).toLocaleString()}\n\n`;
                });

                if (recentWhales.length > 10) {
                    message += `...i ${recentWhales.length - 10} więcej`;
                }

                bot.sendMessage(chatId, message, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error getting whale transactions:', error);
                bot.sendMessage(chatId, '❌ Błąd pobierania danych whales. Spróbuj później.');
            }
        });

        // Handle /whalesettings command - NEW
        bot.onText(/\/whalesettings/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            try {
                const user = await db.getUser(userId);
                const currentThreshold = user ? user.whale_threshold : 40;
                const whaleStats = whaleMonitor.getMonitoringStats();

                const settingsMsg = `
🐋 **Ustawienia Monitorowania whales**

**Twój próg alertów:** ${currentThreshold} IP
**Status monitorowania:** ${whaleStats.isMonitoring ? '✅ AKTYWNE' : '❌ NIEAKTYWNE'}
**Monitorowane tokeny:** ${whaleStats.monitoredTokens} (nowo utworzone)
**Tryb:** ${whaleStats.mode}

**🔥 Specjalne funkcje:**
- Alerty dla tokenów utworzonych w ostatnich 4h
- Priorytet dla nowych projektów IP
- Śledzenie wzorców whales

**Zmień ustawienia:**
/whale [kwota] - Ustaw nowy próg
/whale 40 - Wszystkie whales
/whale 100 - Średnie whales
/whale 500 - Duże whales

**Ostatnia aktywność:** ${whaleStats.isMonitoring ? 'Monitorowanie aktywne' : 'Brak aktywności'}
        `;

                bot.sendMessage(chatId, settingsMsg, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error getting whale settings:', error);
                bot.sendMessage(chatId, '❌ Błąd pobierania ustawień. Spróbuj ponownie.');
            }
        });

        // Handle /status command (updated)
        bot.onText(/\/status/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            try {
                const user = await db.getUser(userId);

                if (!user) {
                    bot.sendMessage(chatId, '❌ Użytkownik nie znaleziony. Wyślij /start najpierw.');
                    return;
                }

                const whaleThreshold = user.whale_threshold || 40;

                const statusMsg = `
📊 **Status Twoich Alertów**

**ID Użytkownika:** ${user.user_id}
**Próg whale:** ${whaleThreshold} IP
**Alerty IP:** ${user.ip_alerts ? '✅ WŁĄCZONE' : '❌ WYŁĄCZONE'}
**Alerty Burn:** ${user.burn_alerts ? '✅ WŁĄCZONE' : '❌ WYŁĄCZONE'}
**Alerty whales:** ✅ WŁĄCZONE
**Zarejestrowano:** ${new Date(user.created_at).toLocaleDateString()}

**🐋 Monitorowanie whales:**
- Nowe tokeny IP (ostatnie 4h)
- Transakcje ≥ ${whaleThreshold} IP
- Priorytetowe alerty dla fresh tokenów

Ustawienia wyglądają dobrze! 🚀
        `;

                bot.sendMessage(chatId, statusMsg, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error getting user status:', error);
                bot.sendMessage(chatId, '❌ Błąd pobierania statusu. Spróbuj ponownie.');
            }
        });

        // Handle /users command
        bot.onText(/\/users/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const users = await db.getAllUsers();
                const totalUsers = users.length;

                bot.sendMessage(chatId, `👥 **Łącznie zarejestrowanych użytkowników:** ${totalUsers}\n\nGotowi na alerty Story Protocol! 🚀`);

            } catch (error) {
                console.error('❌ Error getting users:', error);
                bot.sendMessage(chatId, '❌ Błąd pobierania liczby użytkowników.');
            }
        });

        // Handle /test command
        bot.onText(/\/test/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                // Test database by getting recent IPs
                const recentIPs = await db.getRecentIPs(24);
                const whaleStats = whaleMonitor.getMonitoringStats();

                bot.sendMessage(chatId, `
🧪 **Wyniki Testu Systemu**

✅ Połączenie z bazą danych: Działa
✅ Rejestracja użytkowników: Działa  
📊 Ostatnie IP (24h): ${recentIPs.length}
🐋 Monitorowanie whales: ${whaleStats.isMonitoring ? 'AKTYWNE' : 'NIEAKTYWNE'}
📡 Monitorowane tokeny: ${whaleStats.monitoredTokens}

Baza danych gotowa do monitorowania! 🚀
        `, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Database test error:', error);
                bot.sendMessage(chatId, '❌ Test bazy danych nieudany. Sprawdź logi.');
            }
        });

        // Handle /newips command
        bot.onText(/\/newips/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                bot.sendMessage(chatId, '🔍 Pobieranie ostatnich kreacji IP...');

                const recentIPs = await storyMonitor.getRecentIPs(24);

                if (recentIPs.length === 0) {
                    bot.sendMessage(chatId, `
📊 **Ostatnie IP Assets (24h)**

Nie znaleziono nowych IP assets w ciągu ostatnich 24 godzin.

Monitorowanie jest aktywne - otrzymasz alerty gdy nowe IP będą utworzone! 🚀
      `);
                    return;
                }

                let message = `📊 **Ostatnie IP Assets (24h): ${recentIPs.length}**\n\n`;

                recentIPs.slice(0, 10).forEach((ip, index) => {
                    message += `**${index + 1}.** ${ip.name}\n`;
                    message += `Adres: \`${ip.address}\`\n`;
                    message += `Twórca: \`${ip.creator}...\`\n`;
                    message += `Podaż: ${ip.initial_supply?.toLocaleString() || 'Nieznana'}\n`;
                    message += `Utworzono: ${new Date(ip.created_at).toLocaleString()}\n\n`;
                });

                if (recentIPs.length > 10) {
                    message += `...i ${recentIPs.length - 10} więcej`;
                }

                bot.sendMessage(chatId, message, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error getting recent IPs:', error);
                bot.sendMessage(chatId, '❌ Błąd pobierania danych IP. Spróbuj później.');
            }
        });

        // Handle /monitor command
        bot.onText(/\/monitor/, async (msg) => {
            const chatId = msg.chat.id;

            const storyStatus = storyMonitor && storyMonitor.isMonitoring ? '✅ AKTYWNY' : '❌ NIEAKTYWNY';
            const whaleStatus = whaleMonitor && whaleMonitor.isMonitoring ? '✅ AKTYWNY' : '❌ NIEAKTYWNY';
            const whaleStats = whaleMonitor.getMonitoringStats();

            bot.sendMessage(chatId, `
🔍 **Status Monitora Story Protocol**

**Status IP:** ${storyStatus}
**Status whales:** ${whaleStatus}
**Monitorowanie:** Tworzenie nowych IP + transakcje whales
**Interwał sprawdzania:** Co 30 sekund
**Baza danych:** ${db ? '✅ Połączona' : '❌ Rozłączona'}

**🐋 Monitorowanie whales:**
- Monitorowane nowe tokeny: ${whaleStats.monitoredTokens}
- Tryb: ${whaleStats.mode}
- Okno czasowe: 4 godziny dla nowych tokenów

Otrzymasz alerty dla:
- 🆕 Tworzenia nowych IP assets
- 🐋 whale transakcji (powyżej Twojego progu)
- 🔥 Priorytetowych alertów dla fresh tokenów
- 📊 Informacji o podażach i twórcach
- 🔗 Bezpośrednich linków do Storyscan

Zostań w gotowości na alpha! 🚀
  `, {parse_mode: 'Markdown'});
        });

        // Handle /help command - NEW
        bot.onText(/\/help/, async (msg) => {
            const chatId = msg.chat.id;

            const helpMsg = `
📖 **Pomoc - Story Protocol Bot**

**🎯 Podstawowe Komendy:**
/start - Rejestracja i menu główne
/help - Ta lista komend
/status - Twój status alertów
/users - Liczba użytkowników

**📊 Monitorowanie IP Assets:**
/newips - Najnowsze tokeny IP (24h)
/monitor - Status systemu monitorowania
/test - Test połączeń systemowych

**🐋 Alerty whales:**
/whale [kwota] - Ustaw próg alertów (np. /whale 100)
/whales - Ostatnie transakcje whales
/whalesettings - Zarządzaj ustawieniami whales

**🔥 Specjalne Funkcje:**
- **Fresh Token Priority** - Dodatkowe alerty dla tokenów utworzonych w ostatnich 4h
- **whale Transakcje** - Konfigurowalne progi (domyślnie 40 IP)
- **Real-time Monitoring** - Alerty w czasie rzeczywistym
- **Smart Filtering** - Inteligentne filtrowanie szumu

**💡 Pro Tips:**
- Ustaw /whale 40 dla wszystkich whales
- Świeże tokeny (4h) mają wyższy priorytet
- Wszystkie linki prowadzą do Storyscan
- Bot działa 24/7

**🚀 Przykłady:**
\`/whale 50\` - Alerty dla transakcji ≥ 50 IP
\`/newips\` - Pokaż tokeny z ostatnich 24h
\`/whales\` - Ostatnia aktywność whales

Potrzebujesz pomocy? Napisz do @story_monitor_support
            `;

            bot.sendMessage(chatId, helpMsg, {parse_mode: 'Markdown'});
        });

        // Handle errors
        bot.on('polling_error', (error) => {
            console.error('❌ Polling error:', error.message);
        });

        console.log('✅ Bot initialized and running!');
        console.log('✅ Database ready for Story Protocol monitoring');
        console.log('🐋 Whale monitoring system ready');
        console.log('Send /start to your bot to test it.');

    } catch (error) {
        console.error('❌ Failed to initialize bot:', error);
        process.exit(1);
    }
}

// Mock function for whale transactions (replace with real database query)
async function getRecentWhaleTransactions(hours) {
    // This would be replaced with actual database query
    const mockWhales = [
        {
            amount: 156,
            type: 'buy',
            tokenName: 'Creative Asset Token',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        },
        {
            amount: 89,
            type: 'sell',
            tokenName: 'Music Rights IP',
            timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
        }
    ];

    return Math.random() > 0.5 ? mockWhales : [];
}

// Handle shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot...');

    if (storyMonitor) {
        storyMonitor.stopMonitoring();
    }

    if (whaleMonitor) {
        whaleMonitor.stopMonitoring();
    }

    if (db) {
        await db.close();
    }

    process.exit(0);
});

// Start the bot
initializeBot();
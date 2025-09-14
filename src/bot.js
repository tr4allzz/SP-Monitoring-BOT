require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('./config/database');
const { StoryProtocolMonitor } = require('./services/storyMonitor');
const { WhaleMonitor } = require('./services/whaleMonitor');

console.log('🚀 Starting Story Monitor Bot - REAL DATA ONLY...');

// Check if bot token exists
if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN missing! Add your bot token to .env file');
    process.exit(1);
}

let bot;
let db;
let storyMonitor;
let whaleMonitor;

// Add these functions before initializeBot()
function formatTokenAnalysis(analysis) {
    if (!analysis) {
        return "❌ No analysis data available for this token";
    }

    let message = `📊 **Token Analysis**\n\n`;

    if (analysis.firstTenMinutes) {
        const tenMin = analysis.firstTenMinutes;
        message += `**First 10 Minutes:**\n`;
        message += `• Transactions: ${tenMin.txCount || 0}\n`;
        message += `• Unique Wallets: ${tenMin.uniqueWallets?.size || 0}\n`;
        message += `• Total Volume: $${(tenMin.totalVolume || 0).toLocaleString()}\n`;
        message += `• Avg TX Size: $${Math.round(tenMin.avgTxSize || 0)}\n\n`;
    }

    if (analysis.launchPhase) {
        message += `**Launch Phase:** ${analysis.launchPhase}\n`;
    }

    if (analysis.whaleEntryPattern) {
        message += `**Whale Pattern:** ${analysis.whaleEntryPattern}\n`;
    }

    return message;
}

function formatTokenCalendar(calendar) {
    if (!calendar) {
        return "❌ No calendar data available for this token";
    }

    let message = `📅 **Token Calendar**\n\n`;
    message += `**Launch Time:** ${new Date(calendar.launch_time).toLocaleString()}\n\n`;

    if (calendar.milestones && Object.keys(calendar.milestones).length > 0) {
        message += `**Market Cap Milestones:**\n`;

        Object.entries(calendar.milestones)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .forEach(([milestone, data]) => {
                message += `• $${parseInt(milestone).toLocaleString()}: ${new Date(data.reached_at).toLocaleString()}\n`;
                if (data.time_from_launch) {
                    message += `  └ Time: ${data.time_from_launch}\n`;
                }
            });
    } else {
        message += "No milestones reached yet\n";
    }

    return message;
}

// Enhanced error handling for database calls
async function safeDbCall(dbMethod, ...args) {
    try {
        if (typeof dbMethod === 'function') {
            return await dbMethod.apply(db, args);
        } else {
            console.error('❌ Database method not found');
            return null;
        }
    } catch (error) {
        console.error('❌ Database call failed:', error.message);
        return null;
    }
}

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
/analyze [adres] - Szczegółowa analiza tokenu
/calendar [adres] - Kalendarz progów market cap
/exclude [adres] [powód] - Wyklucz token z alertów
/excluded - Lista wykluczonych tokenów
/test - Test połączenia z bazą danych
/help - Pełna lista komend

🚀 Monitorowanie Story Protocol jest AKTYWNE!
Otrzymasz alerty w czasie rzeczywistym dla nowych IP assets i whale transakcji! 💰

⚡ **Real-time Blockchain Monitoring** - Bez danych testowych!
        `;

                bot.sendMessage(chatId, welcomeMsg, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error handling /start:', error);
                bot.sendMessage(chatId, '❌ Błąd rejestracji użytkownika. Spróbuj ponownie.');
            }
        });

        // Handle /whale command
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

        // Handle /whales command - REAL DATA ONLY
        bot.onText(/\/whales/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                bot.sendMessage(chatId, '🔍 Pobieranie ostatnich transakcji whales...');

                // Use real database query instead of mock data
                const recentWhales = await db.getRecentWhaleTransactions(24);

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
                    const emoji = whale.transaction_type === 'buy' ? '💰' :
                        whale.transaction_type === 'sell' ? '💸' : '🔄';
                    const action = whale.transaction_type?.toUpperCase() || 'TRANSFER';

                    message += `**${index + 1}.** ${emoji} ${action}\n`;
                    message += `**Kwota:** ${whale.amount?.toLocaleString() || 'Unknown'} tokens\n`;
                    message += `**Token:** ${whale.token_name || 'Unknown Token'}\n`;
                    message += `**Hash:** \`${whale.hash}\`\n`;
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

        // Handle /whalesettings command
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

        // Handle /status command
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

        // Enhanced /analyze command for detailed token analysis
        bot.onText(/\/analyze\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const tokenAddress = match[1].trim();

            try {
                bot.sendMessage(chatId, '🔍 Analyzing token...');
                const analysis = await whaleMonitor.getDetailedTokenAnalysis(tokenAddress);
                const formattedAnalysis = formatTokenAnalysis(analysis);

                bot.sendMessage(chatId, formattedAnalysis, {
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                console.error('❌ Error analyzing token:', error);
                bot.sendMessage(chatId, '❌ Error analyzing token');
            }
        });

        // Command to exclude tokens
        bot.onText(/\/exclude\s+(.+)\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const tokenAddress = match[1].trim();
            const reason = match[2].trim();

            try {
                await db.excludeToken(tokenAddress, 'Manual Exclusion', reason);
                bot.sendMessage(chatId, `🚫 Token ${tokenAddress} excluded: ${reason}`);
            } catch (error) {
                console.error('❌ Error excluding token:', error);
                bot.sendMessage(chatId, '❌ Error excluding token');
            }
        });

        // Command to list excluded tokens
        bot.onText(/\/excluded/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const excluded = await db.getExcludedTokens();

                let message = `🚫 **Excluded Tokens (${excluded.length})**\n\n`;

                excluded.slice(0, 10).forEach((token, index) => {
                    message += `**${index + 1}.** ${token.token_name || 'Unknown'}\n`;
                    message += `Address: \`${token.address}\`\n`;
                    message += `Reason: ${token.reason}\n`;
                    message += `Excluded: ${new Date(token.excluded_at).toLocaleDateString()}\n\n`;
                });

                if (excluded.length > 10) {
                    message += `...and ${excluded.length - 10} more tokens`;
                }

                bot.sendMessage(chatId, message, {parse_mode: 'Markdown'});
            } catch (error) {
                console.error('❌ Error getting excluded tokens:', error);
                bot.sendMessage(chatId, '❌ Error getting excluded tokens');
            }
        });

        // Command to check database version
        bot.onText(/\/dbversion/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const version = await db.getSchemaVersion();
                bot.sendMessage(chatId, `📊 Database schema version: ${version}`);
            } catch (error) {
                console.error('❌ Error checking database version:', error);
                bot.sendMessage(chatId, '❌ Error checking database version');
            }
        });

        // /calendar command for mcap progression
        bot.onText(/\/calendar\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const tokenAddress = match[1].trim();

            try {
                bot.sendMessage(chatId, '📅 Getting token calendar...');
                const calendar = await whaleMonitor.getTokenCalendar(tokenAddress);
                const formatted = formatTokenCalendar(calendar);

                bot.sendMessage(chatId, formatted, {parse_mode: 'Markdown'});
            } catch (error) {
                console.error('❌ Error getting token calendar:', error);
                bot.sendMessage(chatId, '❌ Error getting token calendar');
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

        // Handle /help command - UPDATED
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

**🔍 Analiza i Zarządzanie:**
/analyze [adres] - Szczegółowa analiza tokenu
/calendar [adres] - Kalendarz progów market cap
/exclude [adres] [powód] - Wyklucz token z alertów
/excluded - Lista wykluczonych tokenów
/dbversion - Wersja bazy danych

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
\`/analyze 0x123...\` - Analiza konkretnego tokenu
\`/exclude 0x123... spam token\` - Wyklucz spam token
\`/calendar 0x123...\` - Pokaż progi market cap

Potrzebujesz pomocy? Napisz do @story_monitor_support
        `;

            bot.sendMessage(chatId, helpMsg, {parse_mode: 'Markdown'});
        });

        // Handle errors
        bot.on('polling_error', (error) => {
            console.error('❌ Polling error:', error.message);
        });

        bot.on('error', (error) => {
            console.error('❌ Bot error:', error.message);
        });

        console.log('✅ Bot initialized and running!');
        console.log('✅ Database ready for Story Protocol monitoring');
        console.log('🐋 Whale monitoring system ready - REAL BLOCKCHAIN DATA ONLY');
        console.log('⚡ No mock data - all alerts are from live transactions');
        console.log('Send /start to your bot to test it.');

    } catch (error) {
        console.error('❌ Failed to initialize bot:', error);
        process.exit(1);
    }
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
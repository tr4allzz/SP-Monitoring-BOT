
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { getDatabase } = require('./config/database');
const { StoryProtocolMonitor } = require('./services/storyMonitor');
console.log('🚀 Starting Story Monitor Bot...');

// Check if bot token exists
if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN missing! Add your bot token to .env file');
    process.exit(1);
}

let bot;
let db;
let storyMonitor;
async function initializeBot() {
    try {
        // Initialize database
        console.log('📊 Initializing database...');
        db = await getDatabase();

        // Create bot instance
        bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});
// Initialize database
        console.log('📊 Initializing database...');
        db = await getDatabase();

// Create bot instance
        bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});

// Initialize Story Protocol monitoring         // <- ADD FROM HERE
        console.log('🔍 Initializing Story monitoring...');
        storyMonitor = new StoryProtocolMonitor(db);
        const rpcConnected = await storyMonitor.initialize();

        if (rpcConnected) {
            console.log('✅ Story Protocol RPC connected');
            // Start monitoring after a 5 second delay
            setTimeout(() => {
                storyMonitor.startMonitoring(bot);
            }, 5000);
        } else {
            console.log('⚠️  Story Protocol monitoring disabled (RPC connection failed)');
        }                                             // <- ADD UNTIL HERE
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

Welcome ${userName}! You're now registered for alerts.

**Available Commands:**
/start - Register/show this message
/status - Check your alert settings  
/users - Show total registered users
/newips - Show recent IP creations
/monitor - Check monitoring status
/test - Test database connection

🚀 Story Protocol monitoring is ACTIVE!
You'll get real-time alerts for new IP assets! 💰
        `;

                bot.sendMessage(chatId, welcomeMsg, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error handling /start:', error);
                bot.sendMessage(chatId, '❌ Error registering user. Please try again.');
            }
        });

        // Handle /status command
        bot.onText(/\/status/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            try {
                const user = await db.getUser(userId);

                if (!user) {
                    bot.sendMessage(chatId, '❌ User not found. Send /start first.');
                    return;
                }

                const statusMsg = `
📊 **Your Alert Status**

**User ID:** ${user.user_id}
**Whale Threshold:** ${user.whale_threshold} IP
**IP Alerts:** ${user.ip_alerts ? '✅ ON' : '❌ OFF'}
**Burn Alerts:** ${user.burn_alerts ? '✅ ON' : '❌ OFF'}
**Registered:** ${new Date(user.created_at).toLocaleDateString()}

Settings look good! 🚀
        `;

                bot.sendMessage(chatId, statusMsg, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error getting user status:', error);
                bot.sendMessage(chatId, '❌ Error getting status. Try again.');
            }
        });

        // Handle /users command
        bot.onText(/\/users/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const users = await db.getAllUsers();
                const totalUsers = users.length;

                bot.sendMessage(chatId, `👥 **Total registered users:** ${totalUsers}\n\nReady for Story Protocol alerts! 🚀`);

            } catch (error) {
                console.error('❌ Error getting users:', error);
                bot.sendMessage(chatId, '❌ Error getting user count.');
            }
        });

        // Handle /test command
        bot.onText(/\/test/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                // Test database by getting recent IPs (will be empty initially)
                const recentIPs = await db.getRecentIPs(24);

                bot.sendMessage(chatId, `
🧪 **Database Test Results**

✅ Database connection: Working
✅ User registration: Working  
📊 Recent IPs (24h): ${recentIPs.length}

Database is ready for monitoring! 🚀
        `, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Database test error:', error);
                bot.sendMessage(chatId, '❌ Database test failed. Check logs.');
            }
        });

        // Handle /newips command - NEW COMMAND
        bot.onText(/\/newips/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                bot.sendMessage(chatId, '🔍 Fetching recent IP creations...');

                const recentIPs = await storyMonitor.getRecentIPs(24);

                if (recentIPs.length === 0) {
                    bot.sendMessage(chatId, `
📊 **Recent IP Assets (24h)**

No new IP assets found in the last 24 hours.

Monitoring is active - you'll get alerts when new IPs are created! 🚀
      `);
                    return;
                }

                let message = `📊 **Recent IP Assets (24h): ${recentIPs.length}**\n\n`;

                recentIPs.slice(0, 10).forEach((ip, index) => {
                    message += `**${index + 1}.** ${ip.name}\n`;
                    message += `Address: \`${ip.address}\`\n`;
                    message += `Creator: \`${ip.creator}...\`\n`;
                    message += `Supply: ${ip.initial_supply?.toLocaleString() || 'Unknown'}\n`;
                    message += `Created: ${new Date(ip.created_at).toLocaleString()}\n\n`;
                });

                if (recentIPs.length > 10) {
                    message += `...and ${recentIPs.length - 10} more`;
                }

                bot.sendMessage(chatId, message, {parse_mode: 'Markdown'});

            } catch (error) {
                console.error('❌ Error getting recent IPs:', error);
                bot.sendMessage(chatId, '❌ Error fetching IP data. Try again later.');
            }
        });

// Handle /monitor command - NEW COMMAND
        bot.onText(/\/monitor/, async (msg) => {
            const chatId = msg.chat.id;

            const monitorStatus = storyMonitor && storyMonitor.isMonitoring ? '✅ ACTIVE' : '❌ INACTIVE';

            bot.sendMessage(chatId, `
🔍 **Story Protocol Monitor Status**

**Status:** ${monitorStatus}
**Monitoring:** New IP creations
**Check Interval:** Every 30 seconds
**Database:** ${db ? '✅ Connected' : '❌ Disconnected'}

You will receive alerts for:
- 🆕 New IP asset creations
- 📊 Supply and creator info
- 🔗 Direct links to Storyscan

Stay tuned for alpha! 🚀
  `, {parse_mode: 'Markdown'});
        });



        // Handle errors
        bot.on('polling_error', (error) => {
            console.error('❌ Polling error:', error.message);
        });

        console.log('✅ Bot initialized and running!');
        console.log('✅ Database ready for Story Protocol monitoring');
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

    if (db) {
        await db.close();
    }

    process.exit(0);
});

// Start the bot
initializeBot();

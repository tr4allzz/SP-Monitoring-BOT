const { User } = require('../models/User');
const { getRecentIPs } = require('../services/storyMonitor');
const { analyzeWallet } = require('../services/walletAnalyzer');
const { formatIPList, formatWalletAnalysis } = require('../utils/formatter');

function registerCommands(bot) {

    // Start command
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        // Register user
        await User.findOrCreate(userId, chatId);

        const welcomeMessage = `
🎯 **Story Protocol Monitor Bot**

Track new IP tokens, whale moves, and burns in real-time!

**Commands:**
/newips - Latest IP asset creations
/whale [amount] - Set whale alert threshold (default: 40 IP)
/burns - Recent token burns
/wallet [address] - Analyze wallet activity
/alerts - Manage your alerts
/help - Show all commands

Ready to catch some alpha! 💰
    `;

        bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // New IPs command
    bot.onText(/\/newips/, async (msg) => {
        const chatId = msg.chat.id;

        try {
            bot.sendMessage(chatId, '🔍 Fetching latest IP creations...');

            const recentIPs = await getRecentIPs(24); // Last 24 hours
            const formattedList = formatIPList(recentIPs);

            bot.sendMessage(chatId, formattedList, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

        } catch (error) {
            bot.sendMessage(chatId, '❌ Error fetching IP data. Try again later.');
        }
    });

    // Whale threshold setting
    bot.onText(/\/whale(?:\s+(\d+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const threshold = match[1] ? parseInt(match[1]) : null;

        if (!threshold) {
            bot.sendMessage(chatId, 'Current whale threshold: 40 IP\n\nUsage: `/whale [amount]`\nExample: `/whale 100`', {
                parse_mode: 'Markdown'
            });
            return;
        }

        if (threshold < 1 || threshold > 10000) {
            bot.sendMessage(chatId, '❌ Please enter a threshold between 1 and 10,000 IP');
            return;
        }

        await User.updateWhaleThreshold(userId, threshold);
        bot.sendMessage(chatId, `🐋 Whale alert threshold set to ${threshold} IP tokens!`);
    });

    // Wallet analysis
    bot.onText(/\/wallet\s+(.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const walletAddress = match[1].trim();

        if (!isValidAddress(walletAddress)) {
            bot.sendMessage(chatId, '❌ Invalid wallet address format');
            return;
        }

        try {
            bot.sendMessage(chatId, '🔍 Analyzing wallet...');

            const analysis = await analyzeWallet(walletAddress);
            const formattedAnalysis = formatWalletAnalysis(analysis);

            bot.sendMessage(chatId, formattedAnalysis, {
                parse_mode: 'Markdown'
            });

        } catch (error) {
            bot.sendMessage(chatId, '❌ Error analyzing wallet. Please try again.');
        }
    });
}

module.exports = { registerCommands };
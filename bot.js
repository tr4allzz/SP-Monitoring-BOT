require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { initDatabase } = require('./config/database');
const { registerCommands } = require('./handlers/commands');
const { startMonitoring } = require('./services/storyMonitor');
const logger = require('./config/logger');

class StoryMonitorBot {
    constructor() {
        this.bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
        this.isRunning = false;
    }

    async initialize() {
        try {
            // Initialize database
            await initDatabase();
            logger.info('Database initialized');

            // Register command handlers
            registerCommands(this.bot);
            logger.info('Commands registered');

            // Start monitoring services
            await startMonitoring(this.bot);
            logger.info('Monitoring services started');

            this.isRunning = true;
            logger.info('🚀 Story Monitor Bot is running!');

        } catch (error) {
            logger.error('Failed to initialize bot:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        logger.info('Shutting down bot...');
        this.isRunning = false;
        await this.bot.stopPolling();
        process.exit(0);
    }
}

// Initialize and start bot
const bot = new StoryMonitorBot();

// Graceful shutdown
process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());

// Start bot
bot.initialize();
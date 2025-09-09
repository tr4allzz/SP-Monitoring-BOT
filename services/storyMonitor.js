const { ethers } = require('ethers');
const { scrapeNewIPs } = require('./storyscanScraper');
const { trackWhaleMovements } = require('./whaleTracker');
const { monitorBurns } = require('./burnTracker');
const logger = require('../config/logger');

class StoryMonitor {
    constructor(bot) {
        this.bot = bot;
        this.provider = new ethers.JsonRpcProvider(process.env.STORY_RPC_URL);
        this.isMonitoring = false;
    }

    async startMonitoring() {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        logger.info('Starting Story Protocol monitoring...');

        // Start different monitoring services
        this.startIPMonitoring();
        this.startWhaleMonitoring();
        this.startBurnMonitoring();
    }

    async startIPMonitoring() {
        setInterval(async () => {
            try {
                const newIPs = await scrapeNewIPs();

                if (newIPs.length > 0) {
                    await this.notifyNewIPs(newIPs);
                }

            } catch (error) {
                logger.error('IP monitoring error:', error);
            }
        }, 10000); // Check every 10 seconds
    }

    async startWhaleMonitoring() {
        setInterval(async () => {
            try {
                const whaleMovements = await trackWhaleMovements();

                if (whaleMovements.length > 0) {
                    await this.notifyWhaleMovements(whaleMovements);
                }

            } catch (error) {
                logger.error('Whale monitoring error:', error);
            }
        }, 5000); // Check every 5 seconds
    }

    async notifyNewIPs(newIPs) {
        const subscribers = await User.getIPAlertSubscribers();

        for (const ip of newIPs) {
            const message = `
🆕 **New IP Asset Created!**

**Name:** ${ip.name}
**Creator:** \`${ip.creator}\`
**Supply:** ${ip.initialSupply} tokens
**Created:** ${ip.createdAt}

[View on Storyscan](https://storyscan.io/address/${ip.address})
      `;

            for (const user of subscribers) {
                try {
                    await this.bot.sendMessage(user.chatId, message, {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    });
                } catch (error) {
                    logger.error(`Failed to send IP alert to user ${user.userId}:`, error);
                }
            }
        }
    }
}

let monitor;

async function startMonitoring(bot) {
    monitor = new StoryMonitor(bot);
    await monitor.startMonitoring();
}

async function getRecentIPs(hours = 24) {
    return await scrapeNewIPs(hours);
}

module.exports = { startMonitoring, getRecentIPs };
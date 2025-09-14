require('dotenv').config();
const { getDatabase } = require('./config/database');
const { StoryProtocolMonitor } = require('./services/storyMonitor');
const { WhaleMonitor } = require('./services/whaleMonitor');

console.log('🚀 Starting Story Protocol Monitor Server (No Telegram)...');

let db;
let storyMonitor;
let whaleMonitor;

async function initializeServer() {
    try {
        // Initialize database
        console.log('📊 Initializing database...');
        db = await getDatabase();

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
                storyMonitor.startMonitoringServerMode();
                whaleMonitor.startWhaleMonitoringServerMode();
            }, 5000);
        } else {
            console.log('⚠️  Story Protocol monitoring disabled (RPC connection failed)');
        }

        // Keep the process running
        console.log('✅ Server initialized and running!');
        console.log('✅ Database ready for Story Protocol monitoring');
        console.log('🐋 Whale monitoring system ready - REAL BLOCKCHAIN DATA ONLY');
        console.log('⚡ Server mode - monitoring and storing data without Telegram alerts');

        // Log stats every 5 minutes
        setInterval(async () => {
            try {
                const recentIPs = await db.getRecentIPs(24);
                const recentWhales = await db.getRecentWhaleTransactions(24);
                const whaleStats = whaleMonitor.getMonitoringStats();

                console.log(`📊 Server Stats: IPs(24h): ${recentIPs.length}, Whales(24h): ${recentWhales.length}, Monitored Tokens: ${whaleStats.monitoredTokens}`);
            } catch (error) {
                console.error('❌ Error getting stats:', error.message);
            }
        }, 5 * 60 * 1000); // Every 5 minutes

    } catch (error) {
        console.error('❌ Failed to initialize server:', error);
        process.exit(1);
    }
}

// Handle shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');

    if (storyMonitor) {
        storyMonitor.stopMonitoring();
    }

    if (whaleMonitor) {
        whaleMonitor.stopMonitoring();
    }

    if (db) {
        await db.close();
    }

    console.log('✅ Server shutdown complete');
    process.exit(0);
});

// Handle SIGTERM (for PM2 or other process managers)
process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down server...');

    if (storyMonitor) {
        storyMonitor.stopMonitoring();
    }

    if (whaleMonitor) {
        whaleMonitor.stopMonitoring();
    }

    if (db) {
        await db.close();
    }

    console.log('✅ Server shutdown complete');
    process.exit(0);
});

// Start the server
initializeServer();
const axios = require('axios');
const { ethers } = require('ethers');

class StoryProtocolMonitor {
    constructor(database) {
        this.db = database;
        this.rpcUrls = [
            'https://mainnet.storyrpc.io',
            'https://rpc.story.foundation',
            'https://story-rpc.ankr.com'
        ];
        this.storyscanUrl = 'https://www.storyscan.io';
        this.provider = null;
        this.currentRpcIndex = 0;
        this.isMonitoring = false;
        this.lastCheckedBlock = null;
        this.contractAddresses = {
            // Story Protocol contract addresses - these need to be updated with real ones
            IPAssetRegistry: '0x...' // Replace with actual contract address
        };
    }

    async initialize() {
        // Try each RPC URL until one works
        for (let i = 0; i < this.rpcUrls.length; i++) {
            const rpcUrl = this.rpcUrls[i];
            console.log(`🔗 Trying RPC: ${rpcUrl}`);

            try {
                this.provider = new ethers.JsonRpcProvider(rpcUrl);

                // Test connection with timeout
                const blockNumber = await Promise.race([
                    this.provider.getBlockNumber(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
                ]);

                console.log(`✅ Connected to Story Protocol RPC - Block: ${blockNumber}`);
                console.log(`✅ Using RPC: ${rpcUrl}`);
                this.currentRpcIndex = i;
                this.lastCheckedBlock = blockNumber;
                return true;

            } catch (error) {
                console.log(`❌ RPC ${rpcUrl} failed: ${error.message}`);
                continue;
            }
        }

        console.error('❌ All RPC endpoints failed.');
        return false;
    }

    async startMonitoring(bot) {
        if (this.isMonitoring) {
            console.log('⚠️  Monitoring already started');
            return;
        }

        this.isMonitoring = true;
        this.bot = bot;

        console.log('🔍 Starting Story Protocol monitoring...');

        if (this.provider) {
            console.log('✅ Using real blockchain monitoring');
            this.monitorNewBlocks();
        } else {
            console.log('❌ No RPC connection - monitoring disabled');
        }

        console.log('✅ Story Protocol monitoring started');
    }

    // ✅ REAL BLOCKCHAIN MONITORING
    async monitorNewBlocks() {
        const checkInterval = 30000; // 30 seconds

        const monitor = async () => {
            if (!this.isMonitoring) return;

            try {
                const currentBlock = await this.provider.getBlockNumber();

                if (this.lastCheckedBlock && currentBlock > this.lastCheckedBlock) {
                    console.log(`🔍 Checking blocks ${this.lastCheckedBlock + 1} to ${currentBlock}`);

                    // Check each new block for IP asset creation events
                    for (let blockNum = this.lastCheckedBlock + 1; blockNum <= currentBlock; blockNum++) {
                        await this.checkBlockForIPEvents(blockNum);
                    }
                }

                this.lastCheckedBlock = currentBlock;

            } catch (error) {
                console.error('❌ Error monitoring blocks:', error.message);

                // Try to reconnect if connection failed
                if (error.message.includes('CONNECTION') || error.message.includes('TIMEOUT')) {
                    console.log('🔄 Attempting to reconnect...');
                    await this.initialize();
                }
            }

            // Schedule next check
            setTimeout(monitor, checkInterval);
        };

        monitor();
    }

    async checkBlockForIPEvents(blockNumber) {
        try {
            const block = await this.provider.getBlock(blockNumber, true);

            if (!block || !block.transactions) {
                return;
            }

            console.log(`🔍 Checking block ${blockNumber} with ${block.transactions.length} transactions`);

            for (const tx of block.transactions) {
                await this.analyzeTransaction(tx, block);
            }

        } catch (error) {
            console.error(`❌ Error checking block ${blockNumber}:`, error.message);
        }
    }

    async analyzeTransaction(txHash, block) {
        try {
            const tx = typeof txHash === 'string'
                ? await this.provider.getTransaction(txHash)
                : txHash;

            if (!tx) return;

            // Check if transaction is related to IP asset creation
            const isIPCreation = await this.isIPAssetCreation(tx);

            if (isIPCreation) {
                const ipAsset = await this.extractIPAssetInfo(tx, block);
                if (ipAsset) {
                    await this.processNewIPs([ipAsset]);
                }
            }

        } catch (error) {
            console.error(`❌ Error analyzing transaction:`, error.message);
        }
    }

    async isIPAssetCreation(tx) {
        // Check if transaction is to known IP asset contract
        // This needs to be updated with actual Story Protocol contract addresses
        const knownContracts = [
            this.contractAddresses.IPAssetRegistry,
            // Add more contract addresses as needed
        ].filter(addr => addr && addr !== '0x...');

        if (knownContracts.includes(tx.to?.toLowerCase())) {
            return true;
        }

        // Check for specific function signatures related to IP creation
        if (tx.data) {
            const functionSignatures = [
                '0x...', // registerIP function signature
                '0x...', // createIPAsset function signature
                // Add actual function signatures here
            ];

            for (const sig of functionSignatures) {
                if (tx.data.startsWith(sig)) {
                    return true;
                }
            }
        }

        return false;
    }

    async extractIPAssetInfo(tx, block) {
        try {
            const receipt = await this.provider.getTransactionReceipt(tx.hash);

            if (!receipt || !receipt.logs) {
                return null;
            }

            // Parse logs for IP asset creation events
            for (const log of receipt.logs) {
                const ipInfo = await this.parseIPCreationLog(log, tx, block);
                if (ipInfo) {
                    return ipInfo;
                }
            }

            return null;

        } catch (error) {
            console.error(`❌ Error extracting IP info:`, error.message);
            return null;
        }
    }

    async parseIPCreationLog(log, tx, block) {
        try {
            // This needs to be implemented with actual Story Protocol event signatures
            // Example ABI for IP creation event:
            const ipCreationABI = [
                "event IPRegistered(address indexed ipId, address indexed owner, string name, uint256 supply)"
            ];

            const iface = new ethers.Interface(ipCreationABI);

            try {
                const decodedLog = iface.parseLog({
                    topics: log.topics,
                    data: log.data
                });

                if (decodedLog.name === 'IPRegistered') {
                    return {
                        address: decodedLog.args.ipId,
                        name: decodedLog.args.name,
                        creator: tx.from,
                        initialSupply: decodedLog.args.supply.toString(),
                        createdAt: new Date(block.timestamp * 1000).toISOString(),
                        txHash: tx.hash,
                        blockNumber: block.number
                    };
                }
            } catch (parseError) {
                // Log not related to IP creation, skip
            }

            return null;

        } catch (error) {
            console.error(`❌ Error parsing IP creation log:`, error.message);
            return null;
        }
    }

    // ✅ FALLBACK: Monitor via Storyscan API
    async monitorViaStoryscan() {
        const checkInterval = 60000; // 1 minute

        const monitor = async () => {
            if (!this.isMonitoring) return;

            try {
                console.log('🔍 Checking Storyscan for new IP assets...');
                const newIPs = await this.fetchFromStoryscan();

                if (newIPs.length > 0) {
                    console.log(`🆕 Found ${newIPs.length} new IP assets via Storyscan`);
                    await this.processNewIPs(newIPs);
                }

            } catch (error) {
                console.error('❌ Error monitoring via Storyscan:', error.message);
            }

            setTimeout(monitor, checkInterval);
        };

        monitor();
    }

    async fetchFromStoryscan() {
        try {
            // Try to fetch from Storyscan API
            const response = await axios.get(`${this.storyscanUrl}/api/v1/tokens`, {
                params: {
                    limit: 10,
                    sort: 'created_desc'
                },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Story-Monitor-Bot/2.0'
                }
            });

            if (response.data && response.data.tokens) {
                return response.data.tokens.map(token => ({
                    address: token.address,
                    name: token.name,
                    creator: token.creator,
                    initialSupply: token.totalSupply,
                    createdAt: token.createdAt,
                    txHash: token.creationTx
                }));
            }

            return [];

        } catch (error) {
            console.log('⚠️  Storyscan API not available:', error.message);
            return [];
        }
    }

    // ✅ REMOVE ALL MOCK DATA METHODS
    // Removed: generateMockIP()
    // Removed: generateRandomIPName()

    async processNewIPs(newIPs) {
        for (const ip of newIPs) {
            try {
                // Check if we already processed this IP
                const existingIP = await this.db.getIPAsset(ip.address);
                if (existingIP) {
                    continue; // Skip already processed IPs
                }

                // Save to database
                await this.db.saveIPAsset(ip);
                console.log(`💾 Saved new IP: ${ip.name} (${ip.address})`);

                // Send alerts to subscribed users
                await this.sendNewIPAlert(ip);

            } catch (error) {
                console.error('❌ Error processing new IP:', error.message);
            }
        }
    }

    async sendNewIPAlert(ip) {
        try {
            const users = await this.db.getAllUsers();

            if (users.length === 0) {
                console.log('📭 No users to alert');
                return;
            }

            const alertMessage = `
🆕 **NEW IP ASSET DETECTED!**

**Name:** ${ip.name}
**Address:** \`${ip.address}\`
**Creator:** \`${ip.creator}\`
**Supply:** ${ip.initialSupply ? parseInt(ip.initialSupply).toLocaleString() : 'Unknown'} tokens
**Time:** ${new Date(ip.createdAt).toLocaleString()}
**Block:** ${ip.blockNumber || 'Unknown'}

[View on Storyscan](${this.storyscanUrl}/address/${ip.address})

🚀 Real Story Protocol IP detected!
            `;

            console.log(`📢 Sending REAL IP alert to ${users.length} users: ${ip.name}`);

            for (const user of users) {
                try {
                    await this.bot.sendMessage(user.chat_id, alertMessage, {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    });

                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`❌ Failed to send alert to user ${user.user_id}:`, error.message);
                }
            }

        } catch (error) {
            console.error('❌ Error sending IP alerts:', error);
        }
    }

    async getRecentIPs(hours = 24) {
        return await this.db.getRecentIPs(hours);
    }

    getConnectionStatus() {
        return {
            rpcConnected: !!this.provider,
            currentRpc: this.provider ? this.rpcUrls[this.currentRpcIndex] : 'None',
            monitoringActive: this.isMonitoring,
            lastCheckedBlock: this.lastCheckedBlock,
            mode: this.provider ? 'Real Blockchain Monitoring' : 'Disabled'
        };
    }
// Add this method to StoryProtocolMonitor class
    async startMonitoringServerMode() {
        if (this.isMonitoring) {
            console.log('⚠️  Monitoring already started');
            return;
        }

        this.isMonitoring = true;
        this.bot = null; // No bot in server mode

        console.log('🔍 Starting Story Protocol monitoring (Server Mode)...');

        if (this.provider) {
            console.log('✅ Using real blockchain monitoring');
            this.monitorNewBlocks();
        } else {
            console.log('❌ No RPC connection - monitoring disabled');
        }

        console.log('✅ Story Protocol monitoring started (Server Mode)');
    }

// Update processNewIPs method to handle server mode
    async processNewIPs(newIPs) {
        for (const ip of newIPs) {
            try {
                // Check if we already processed this IP
                const existingIP = await this.db.getIPAsset(ip.address);
                if (existingIP) {
                    continue; // Skip already processed IPs
                }

                // Save to database
                await this.db.saveIPAsset(ip);
                console.log(`💾 Saved new IP: ${ip.name} (${ip.address})`);

                // In server mode, just log instead of sending alerts
                if (!this.bot) {
                    console.log(`🆕 NEW IP DETECTED (Server Mode): ${ip.name} - ${ip.address}`);
                } else {
                    // Send alerts to subscribed users (original telegram functionality)
                    await this.sendNewIPAlert(ip);
                }

            } catch (error) {
                console.error('❌ Error processing new IP:', error.message);
            }
        }
    }
    stopMonitoring() {
        this.isMonitoring = false;
        console.log('🛑 Story Protocol monitoring stopped');
    }
}

module.exports = { StoryProtocolMonitor };
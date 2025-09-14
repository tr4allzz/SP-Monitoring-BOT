const { ethers } = require('ethers');

class WhaleMonitor {
    constructor(database, storyMonitor) {
        this.db = database;
        this.storyMonitor = storyMonitor;
        this.provider = null;
        this.isMonitoring = false;
        this.whaleThresholds = new Map(); // user_id -> threshold
        this.monitoredTokens = new Map(); // token_address -> creation_time
        this.lastCleanup = Date.now();
        this.lastCheckedBlock = null;

        // ERC20 Transfer event signature
        this.transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    }

    async initialize(provider) {
        this.provider = provider;
        if (this.provider) {
            this.lastCheckedBlock = await this.provider.getBlockNumber();
            console.log('🐋 Whale Monitor initialized with real blockchain monitoring');
        } else {
            console.log('🐋 Whale Monitor initialized without RPC connection');
        }
    }

    async startWhaleMonitoring(bot) {
        if (this.isMonitoring) {
            console.log('⚠️  Whale monitoring already started');
            return;
        }

        this.isMonitoring = true;
        this.bot = bot;

        console.log('🐋 Starting real whale transaction monitoring...');

        if (this.provider) {
            // Monitor new blocks for whale transactions
            this.monitorNewBlocksForWhales();
        } else {
            console.log('❌ No RPC provider - whale monitoring disabled');
        }

        // Update monitored tokens list
        this.updateMonitoredTokensList();

        console.log('✅ Whale monitoring started');
    }

    // ✅ REAL BLOCKCHAIN MONITORING FOR WHALES
    async monitorNewBlocksForWhales() {
        const checkInterval = 30000; // 30 seconds

        const monitor = async () => {
            if (!this.isMonitoring || !this.provider) return;

            try {
                const currentBlock = await this.provider.getBlockNumber();

                if (this.lastCheckedBlock && currentBlock > this.lastCheckedBlock) {
                    console.log(`🐋 Checking blocks ${this.lastCheckedBlock + 1} to ${currentBlock} for whale transactions`);

                    // Check each new block for whale transactions
                    for (let blockNum = this.lastCheckedBlock + 1; blockNum <= currentBlock; blockNum++) {
                        await this.checkBlockForWhaleTransactions(blockNum);
                    }
                }

                this.lastCheckedBlock = currentBlock;

            } catch (error) {
                console.error('❌ Error monitoring blocks for whales:', error.message);

                // Try to reconnect if connection failed
                if (error.message.includes('CONNECTION') || error.message.includes('TIMEOUT')) {
                    console.log('🔄 Attempting to reconnect whale monitor...');
                    this.provider = this.storyMonitor.provider;
                    if (this.provider) {
                        this.lastCheckedBlock = await this.provider.getBlockNumber();
                    }
                }
            }

            setTimeout(monitor, checkInterval);
        };

        monitor();
    }

    async checkBlockForWhaleTransactions(blockNumber) {
        try {
            const block = await this.provider.getBlock(blockNumber, true);

            if (!block || !block.transactions) {
                return;
            }

            console.log(`🐋 Scanning block ${blockNumber} for whale transactions (${block.transactions.length} txs)`);

            for (const tx of block.transactions) {
                await this.analyzeTransactionForWhales(tx, block);
            }

        } catch (error) {
            console.error(`❌ Error checking block ${blockNumber} for whales:`, error.message);
        }
    }

    async analyzeTransactionForWhales(txHash, block) {
        try {
            const tx = typeof txHash === 'string'
                ? await this.provider.getTransaction(txHash)
                : txHash;

            if (!tx) return;

            // Get transaction receipt to analyze logs
            const receipt = await this.provider.getTransactionReceipt(tx.hash);

            if (!receipt || !receipt.logs) {
                return;
            }

            // Analyze each log for ERC20 transfers
            for (const log of receipt.logs) {
                await this.analyzeLogForWhaleActivity(log, tx, block);
            }

        } catch (error) {
            console.error(`❌ Error analyzing transaction for whales:`, error.message);
        }
    }

    async analyzeLogForWhaleActivity(log, tx, block) {
        try {
            // Check if this is an ERC20 Transfer event
            if (log.topics[0] !== this.transferEventSignature) {
                return; // Not a transfer event
            }

            // Decode ERC20 Transfer event
            const transferData = this.decodeTransferEvent(log);
            if (!transferData) return;

            // Get token info
            const tokenInfo = await this.getTokenInfo(log.address);
            if (!tokenInfo) return;

            // Calculate transfer amount in tokens (not wei)
            const transferAmount = this.calculateTokenAmount(transferData.amount, tokenInfo.decimals);

            // Check if this qualifies as a whale transaction
            const isWhaleTransaction = await this.isWhaleTransaction(
                log.address,
                transferAmount,
                transferData.from,
                transferData.to
            );

            if (isWhaleTransaction) {
                const whaleTransaction = {
                    hash: tx.hash,
                    from: transferData.from,
                    to: transferData.to,
                    tokenAddress: log.address,
                    tokenName: tokenInfo.name || 'Unknown Token',
                    tokenSymbol: tokenInfo.symbol || 'UNKNOWN',
                    amount: transferAmount,
                    valueIP: transferAmount, // Assuming 1:1 for now
                    transactionType: this.determineTransactionType(transferData.from, transferData.to),
                    timestamp: new Date(block.timestamp * 1000).toISOString(),
                    blockNumber: block.number,
                    isRecentToken: this.isRecentToken(log.address),
                    tokenAge: this.calculateTokenAge(log.address)
                };

                console.log(`🐋 REAL WHALE DETECTED: ${transferAmount} ${tokenInfo.symbol} in tx ${tx.hash}`);
                await this.processWhaleTransaction(whaleTransaction);
            }

        } catch (error) {
            console.error(`❌ Error analyzing log for whale activity:`, error.message);
        }
    }

    decodeTransferEvent(log) {
        try {
            // ERC20 Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
            if (log.topics.length !== 3) return null;

            const from = '0x' + log.topics[1].slice(26); // Remove padding
            const to = '0x' + log.topics[2].slice(26);   // Remove padding
            const amount = ethers.getBigInt(log.data);

            return { from, to, amount };
        } catch (error) {
            console.error('❌ Error decoding transfer event:', error);
            return null;
        }
    }

    async getTokenInfo(tokenAddress) {
        try {
            // Create ERC20 contract instance
            const erc20ABI = [
                'function name() view returns (string)',
                'function symbol() view returns (string)',
                'function decimals() view returns (uint8)',
                'function totalSupply() view returns (uint256)'
            ];

            const contract = new ethers.Contract(tokenAddress, erc20ABI, this.provider);

            // Get token info with timeout
            const [name, symbol, decimals] = await Promise.race([
                Promise.all([
                    contract.name().catch(() => 'Unknown'),
                    contract.symbol().catch(() => 'UNKNOWN'),
                    contract.decimals().catch(() => 18)
                ]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Token info timeout')), 5000))
            ]);

            return { name, symbol, decimals };

        } catch (error) {
            console.error(`❌ Error getting token info for ${tokenAddress}:`, error.message);
            // Return default values
            return { name: 'Unknown Token', symbol: 'UNKNOWN', decimals: 18 };
        }
    }

    calculateTokenAmount(amountWei, decimals) {
        try {
            const divisor = ethers.parseUnits('1', decimals);
            const amount = Number(amountWei) / Number(divisor);
            return Math.round(amount * 100) / 100; // Round to 2 decimals
        } catch (error) {
            console.error('❌ Error calculating token amount:', error);
            return 0;
        }
    }

    async isWhaleTransaction(tokenAddress, amount, from, to) {
        // Skip zero transfers
        if (amount <= 0) return false;

        // Skip contract creation/burn transactions
        if (from === '0x0000000000000000000000000000000000000000' ||
            to === '0x0000000000000000000000000000000000000000') {
            return false;
        }

        // Check if amount meets whale threshold
        const users = await this.db.getAllUsers();
        let minThreshold = 40; // Default threshold

        // Find the minimum threshold among all users
        for (const user of users) {
            const userThreshold = user.whale_threshold || 40;
            if (userThreshold < minThreshold) {
                minThreshold = userThreshold;
            }
        }

        // Additional bonus for recent tokens (lower threshold)
        if (this.isRecentToken(tokenAddress)) {
            minThreshold = minThreshold * 0.7; // 30% lower threshold for new tokens
        }

        return amount >= minThreshold;
    }

    determineTransactionType(from, to) {
        // Simple heuristic - in a real implementation you'd check DEX contracts
        // For now, assume all transfers are "buy" transactions
        return 'transfer'; // Could be 'buy', 'sell', or 'transfer'
    }

    isRecentToken(tokenAddress) {
        const tokenCreationTime = this.monitoredTokens.get(tokenAddress.toLowerCase());
        if (!tokenCreationTime) return false;

        const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
        return tokenCreationTime >= fourHoursAgo;
    }

    calculateTokenAge(tokenAddress) {
        const tokenCreationTime = this.monitoredTokens.get(tokenAddress.toLowerCase());
        if (!tokenCreationTime) return 'unknown';

        const ageMs = Date.now() - tokenCreationTime;
        const ageMinutes = Math.floor(ageMs / (1000 * 60));

        if (ageMinutes < 60) {
            return `${ageMinutes}m`;
        } else {
            const ageHours = Math.floor(ageMinutes / 60);
            const remainingMinutes = ageMinutes % 60;
            return `${ageHours}h ${remainingMinutes}m`;
        }
    }

    // Update monitored tokens from database
    async updateMonitoredTokensList() {
        const updateInterval = 300000; // 5 minutes

        const update = async () => {
            if (!this.isMonitoring) return;

            try {
                const recentTokens = await this.db.getRecentIPs(4); // Last 4 hours

                // Update monitored tokens map
                this.monitoredTokens.clear();
                for (const token of recentTokens) {
                    const creationTime = new Date(token.created_at).getTime();
                    this.monitoredTokens.set(token.address.toLowerCase(), creationTime);
                }

                console.log(`📊 Updated monitored tokens list: ${this.monitoredTokens.size} recent tokens`);

            } catch (error) {
                console.error('❌ Error updating monitored tokens list:', error.message);
            }

            setTimeout(update, updateInterval);
        };

        update();
    }

    async processWhaleTransaction(transaction) {
        try {
            // Save whale transaction to database
            await this.saveWhaleTransaction(transaction);

            // Send alerts to users who meet criteria
            await this.sendWhaleAlert(transaction);

        } catch (error) {
            console.error('❌ Error processing whale transaction:', error.message);
        }
    }

    async saveWhaleTransaction(transaction) {
        try {
            await this.db.saveWhaleTransaction(transaction);
            console.log(`💾 Saved whale transaction: ${transaction.amount} ${transaction.tokenSymbol}`);
        } catch (error) {
            console.error('❌ Error saving whale transaction:', error.message);
        }
    }

    async sendWhaleAlert(transaction) {
        try {
            const users = await this.db.getAllUsers();

            if (users.length === 0) {
                console.log('📭 No users to alert for whale transaction');
                return;
            }

            // Filter users based on their whale threshold
            const alertUsers = users.filter(user => {
                const userThreshold = user.whale_threshold || 40;
                return transaction.amount >= userThreshold;
            });

            if (alertUsers.length === 0) {
                console.log(`📭 No users meet whale threshold for ${transaction.amount} ${transaction.tokenSymbol} transaction`);
                return;
            }

            const alertMessage = this.formatWhaleAlert(transaction);

            console.log(`📢 Sending REAL whale alert to ${alertUsers.length} users`);

            for (const user of alertUsers) {
                try {
                    await this.bot.sendMessage(user.chat_id, alertMessage, {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    });

                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`❌ Failed to send whale alert to user ${user.user_id}:`, error.message);
                }
            }

        } catch (error) {
            console.error('❌ Error sending whale alerts:', error);
        }
    }

    formatWhaleAlert(transaction) {
        const emoji = transaction.transactionType === 'buy' ? '💰' :
            transaction.transactionType === 'sell' ? '💸' : '🔄';
        const action = transaction.transactionType.toUpperCase();
        const recentBadge = transaction.isRecentToken ? ' 🔥 NOWY TOKEN' : '';
        const tokenAge = transaction.isRecentToken ? `\n**Wiek tokenu:** ${transaction.tokenAge}` : '';

        return `
🐋 **WIELORYB WYKRYTY!** ${recentBadge}

${emoji} **Akcja:** ${action}
**Kwota:** ${transaction.amount.toLocaleString()} ${transaction.tokenSymbol}
**Token:** ${transaction.tokenName}
**Adres tokenu:** \`${transaction.tokenAddress}\`${tokenAge}

**Od:** \`${transaction.from}\`
**Do:** \`${transaction.to}\`
**Blok:** ${transaction.blockNumber}
**Czas:** ${new Date(transaction.timestamp).toLocaleString()}

[📊 Zobacz transakcję](https://www.storyscan.io/tx/${transaction.hash})

${transaction.isRecentToken ? '🚨 **ALPHA ALERT - Nowo utworzony token!**' : '📊 Duża transakcja w sieci Story'}
        `.trim();
    }

    // User management methods
    async setUserWhaleThreshold(userId, threshold) {
        this.whaleThresholds.set(userId, threshold);
        console.log(`🐋 User ${userId} whale threshold set to ${threshold} tokens`);
    }

    getUserWhaleThreshold(userId) {
        return this.whaleThresholds.get(userId) || 40; // Default 40 tokens
    }

    getMonitoringStats() {
        return {
            isMonitoring: this.isMonitoring,
            monitoredTokens: this.monitoredTokens.size,
            activeThresholds: this.whaleThresholds.size,
            lastCheckedBlock: this.lastCheckedBlock,
            mode: this.provider ? 'Real Blockchain Monitoring' : 'Disabled'
        };
    }
// Add these methods to your WhaleMonitor class

    async getDetailedTokenAnalysis(tokenAddress) {
        try {
            // Get token transactions
            const transactions = await this.getTokenTransactions(tokenAddress);

            if (!transactions || transactions.length === 0) {
                return {
                    error: "No transaction data available",
                    tokenAddress: tokenAddress
                };
            }

            // Perform analysis
            const analysis = {
                tokenAddress: tokenAddress,
                totalTransactions: transactions.length,
                firstTenMinutes: this.analyzeFirstTenMinutes(transactions),
                launchPhase: this.determineLaunchPhase(transactions),
                whaleEntryPattern: this.analyzeWhaleEntry(transactions)
            };

            return analysis;
        } catch (error) {
            console.error('Error analyzing token:', error);
            return { error: "Analysis failed", tokenAddress };
        }
    }

    async getTokenTransactions(tokenAddress) {
        const query = `SELECT * FROM transactions WHERE token_address = ? ORDER BY timestamp ASC`;

        return new Promise((resolve, reject) => {
            this.db.db.all(query, [tokenAddress], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    analyzeFirstTenMinutes(transactions) {
        if (!transactions || transactions.length === 0) return null;

        const launchTime = new Date(transactions[0].timestamp).getTime();
        const tenMinutesMs = 10 * 60 * 1000;

        const firstTenMinTxs = transactions.filter(tx =>
            new Date(tx.timestamp).getTime() - launchTime <= tenMinutesMs
        );

        const uniqueWallets = new Set();
        let totalVolume = 0;

        firstTenMinTxs.forEach(tx => {
            uniqueWallets.add(tx.from_address);
            totalVolume += tx.amount || 0;
        });

        return {
            txCount: firstTenMinTxs.length,
            uniqueWallets: uniqueWallets,
            totalVolume: totalVolume,
            avgTxSize: firstTenMinTxs.length > 0 ? totalVolume / firstTenMinTxs.length : 0
        };
    }

    determineLaunchPhase(transactions) {
        if (!transactions || transactions.length === 0) return 'unknown';

        const firstHour = transactions.slice(0, Math.min(20, transactions.length));
        const uniqueWallets = new Set(firstHour.map(tx => tx.from_address));

        if (uniqueWallets.size === 1) return 'single_buyer';
        if (uniqueWallets.size < 5) return 'coordinated';
        if (uniqueWallets.size >= 10) return 'organic';
        return 'normal';
    }

    analyzeWhaleEntry(transactions) {
        if (!transactions || transactions.length === 0) return 'none';

        const largeTxs = transactions.filter(tx => (tx.amount || 0) > 100);

        if (largeTxs.length === 0) return 'none';
        if (largeTxs.length >= 3) return 'heavy';
        return 'moderate';
    }

    async getTokenCalendar(tokenAddress) {
        // Check if token_calendars table exists first
        try {
            const query = `SELECT * FROM token_calendars WHERE address = ?`;

            return new Promise((resolve) => {
                this.db.db.get(query, [tokenAddress], (err, row) => {
                    if (err) {
                        // If table doesn't exist, return default structure
                        resolve({
                            address: tokenAddress,
                            launch_time: new Date().toISOString(),
                            milestones: {},
                            analysis: {}
                        });
                    } else if (!row) {
                        // Token not found, return default
                        resolve({
                            address: tokenAddress,
                            launch_time: new Date().toISOString(),
                            milestones: {},
                            analysis: {}
                        });
                    } else {
                        // Parse existing data
                        resolve({
                            address: row.address,
                            launch_time: row.launch_time,
                            milestones: JSON.parse(row.milestones || '{}'),
                            analysis: JSON.parse(row.analysis_data || '{}')
                        });
                    }
                });
            });
        } catch (error) {
            console.error('Error getting token calendar:', error);
            return {
                address: tokenAddress,
                launch_time: new Date().toISOString(),
                milestones: {},
                analysis: {}
            };
        }
    }
    stopMonitoring() {
        this.isMonitoring = false;
        console.log('🛑 Whale monitoring stopped');
    }
}

module.exports = { WhaleMonitor };
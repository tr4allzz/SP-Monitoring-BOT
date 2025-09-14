// Enhanced whale detection criteria
import {WhaleMonitor} from "./whaleMonitor";

class EnhancedWhaleMonitor extends WhaleMonitor {
    constructor(database, storyMonitor) {
        super(database, storyMonitor);

        // Volume-based monitoring windows
        this.volumeWindows = {
            '15s': new Map(), // tokenAddress -> {volume, count, firstTx}
            '30s': new Map(),
            '1m': new Map(),
            '5m': new Map()
        };

        // High mcap exclusion list
        this.excludedHighMcapTokens = new Set();
        this.mcapThreshold = 200000; // $200k mcap threshold

        // Enhanced criteria
        this.volumeThresholds = {
            '15s': 50,    // $50 in 15 seconds
            '30s': 100,   // $100 in 30 seconds
            '1m': 200,    // $200 in 1 minute
            '5m': 500     // $500 in 5 minutes
        };
    }

    async isWhaleTransaction(tokenAddress, amount, from, to, timestamp) {
        // Skip if token is high mcap
        if (await this.isHighMcapToken(tokenAddress)) {
            return false;
        }

        // Check volume-based criteria instead of single transaction
        return await this.checkVolumePatterns(tokenAddress, amount, timestamp);
    }

    async isHighMcapToken(tokenAddress) {
        // Check if token is in exclusion list
        if (this.excludedHighMcapTokens.has(tokenAddress.toLowerCase())) {
            return true;
        }

        // Get token info and check market cap
        const tokenInfo = await this.getTokenMarketData(tokenAddress);
        if (tokenInfo && tokenInfo.marketCap > this.mcapThreshold) {
            this.excludedHighMcapTokens.add(tokenAddress.toLowerCase());
            return true;
        }

        return false;
    }

    async checkVolumePatterns(tokenAddress, amount, timestamp) {
        const now = Date.now();
        const tokenKey = tokenAddress.toLowerCase();

        // Update volume windows
        for (const [window, windowMap] of Object.entries(this.volumeWindows)) {
            const windowMs = this.parseWindowToMs(window);

            if (!windowMap.has(tokenKey)) {
                windowMap.set(tokenKey, {
                    volume: 0,
                    count: 0,
                    firstTx: now,
                    transactions: []
                });
            }

            const data = windowMap.get(tokenKey);

            // Clean old transactions outside window
            data.transactions = data.transactions.filter(tx =>
                now - tx.timestamp < windowMs
            );

            // Add current transaction
            data.transactions.push({
                amount: amount,
                timestamp: now
            });

            // Update totals
            data.volume = data.transactions.reduce((sum, tx) => sum + tx.amount, 0);
            data.count = data.transactions.length;

            // Check if volume threshold is met
            if (data.volume >= this.volumeThresholds[window]) {
                console.log(`🔥 Volume pattern detected: ${data.volume} in ${window} (${data.count} txs)`);
                return {
                    isWhale: true,
                    pattern: window,
                    volume: data.volume,
                    txCount: data.count,
                    reason: `Volume spike: $${data.volume} in ${window}`
                };
            }
        }

        return { isWhale: false };
    }

    // Add calendar tracking for mcap milestones
    async trackMcapMilestones(tokenAddress) {
        const milestones = [20000, 50000, 100000, 200000, 1000000];
        const tokenInfo = await this.getTokenMarketData(tokenAddress);

        if (!tokenInfo) return;

        const calendar = await this.getTokenCalendar(tokenAddress);

        for (const milestone of milestones) {
            if (tokenInfo.marketCap >= milestone && !calendar.milestones[milestone]) {
                calendar.milestones[milestone] = {
                    reached_at: new Date().toISOString(),
                    time_from_launch: this.calculateTimeFromLaunch(tokenAddress),
                    price_at_milestone: tokenInfo.price
                };

                await this.saveTokenCalendar(tokenAddress, calendar);

                // Send milestone alert
                await this.sendMilestoneAlert(tokenAddress, milestone, calendar.milestones[milestone]);
            }
        }
    }

    // Enhanced transaction analysis
    async analyzeTokenLaunchPattern(tokenAddress, transactions) {
        const analysis = {
            firstTenMinutes: {
                txCount: 0,
                uniqueWallets: new Set(),
                totalVolume: 0,
                avgTxSize: 0,
                blockDistribution: new Map(),
                walletPatterns: new Map()
            },
            launchPhase: this.determineLaunchPhase(transactions),
            whaleEntryPattern: this.analyzeWhaleEntry(transactions),
            marketCapProgression: await this.getMarketCapProgression(tokenAddress)
        };

        // Analyze first 10 minutes
        const tenMinutesMs = 10 * 60 * 1000;
        const launchTime = new Date(transactions[0].timestamp).getTime();

        const firstTenMinTxs = transactions.filter(tx =>
            new Date(tx.timestamp).getTime() - launchTime <= tenMinutesMs
        );

        for (const tx of firstTenMinTxs) {
            analysis.firstTenMinutes.txCount++;
            analysis.firstTenMinutes.uniqueWallets.add(tx.from);
            analysis.firstTenMinutes.totalVolume += tx.amount;

            // Block distribution
            const block = tx.blockNumber;
            analysis.firstTenMinutes.blockDistribution.set(
                block,
                (analysis.firstTenMinutes.blockDistribution.get(block) || 0) + 1
            );

            // Wallet patterns
            const wallet = tx.from;
            if (!analysis.firstTenMinutes.walletPatterns.has(wallet)) {
                analysis.firstTenMinutes.walletPatterns.set(wallet, {
                    txCount: 0,
                    totalAmount: 0,
                    isMultiTx: false
                });
            }

            const walletData = analysis.firstTenMinutes.walletPatterns.get(wallet);
            walletData.txCount++;
            walletData.totalAmount += tx.amount;
            walletData.isMultiTx = walletData.txCount > 1;
        }

        analysis.firstTenMinutes.avgTxSize =
            analysis.firstTenMinutes.totalVolume / analysis.firstTenMinutes.txCount;

        return analysis;
    }

    // Database methods for calendar tracking
    async saveTokenCalendar(tokenAddress, calendar) {
        const query = `INSERT OR REPLACE INTO token_calendars 
            (address, launch_time, milestones, analysis_data, updated_at) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`;

        await this.db.db.run(query, [
            tokenAddress,
            calendar.launch_time,
            JSON.stringify(calendar.milestones),
            JSON.stringify(calendar.analysis)
        ]);
    }

    async getTokenCalendar(tokenAddress) {
        const query = `SELECT * FROM token_calendars WHERE address = ?`;

        return new Promise((resolve) => {
            this.db.db.get(query, [tokenAddress], (err, row) => {
                if (err || !row) {
                    resolve({
                        address: tokenAddress,
                        launch_time: new Date().toISOString(),
                        milestones: {},
                        analysis: {}
                    });
                } else {
                    resolve({
                        address: row.address,
                        launch_time: row.launch_time,
                        milestones: JSON.parse(row.milestones || '{}'),
                        analysis: JSON.parse(row.analysis_data || '{}')
                    });
                }
            });
        });
    }
}
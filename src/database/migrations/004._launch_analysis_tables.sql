-- Launch analysis and wallet pattern tracking
-- For analyzing token launch patterns and first 10 minutes data

BEGIN;

-- Token launch analysis data
CREATE TABLE IF NOT EXISTS token_launch_analysis (
                                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                     token_address TEXT NOT NULL,
                                                     launch_detected_at TIMESTAMP NOT NULL,
                                                     first_ten_minutes_data TEXT, -- JSON with detailed first 10min analysis
                                                     launch_phase TEXT, -- 'stealth', 'public', 'coordinated', 'organic'
                                                     whale_entry_pattern TEXT, -- 'early', 'delayed', 'coordinated', 'none'
                                                     total_launch_volume REAL,
                                                     unique_buyers_10min INTEGER,
                                                     avg_tx_size_10min REAL,
                                                     block_distribution TEXT, -- JSON: block -> tx_count mapping
                                                     wallet_patterns TEXT, -- JSON: wallet analysis data
                                                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                     FOREIGN KEY (token_address) REFERENCES ip_assets (address)
    );

-- Wallet behavior patterns
CREATE TABLE IF NOT EXISTS wallet_patterns (
                                               id INTEGER PRIMARY KEY AUTOINCREMENT,
                                               wallet_address TEXT NOT NULL,
                                               token_address TEXT NOT NULL,
                                               pattern_type TEXT NOT NULL, -- 'multi_tx', 'single_large', 'gradual_accumulation'
                                               tx_count INTEGER NOT NULL,
                                               total_amount REAL NOT NULL,
                                               time_span_minutes REAL, -- how long the buying pattern lasted
                                               first_tx_timestamp TIMESTAMP NOT NULL,
                                               last_tx_timestamp TIMESTAMP NOT NULL,
                                               is_suspicious BOOLEAN DEFAULT 0, -- flag for bot-like behavior
                                               profitability_score REAL, -- if we can calculate it later
                                               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                               FOREIGN KEY (token_address) REFERENCES ip_assets (address)
    );

-- Market cap progression tracking
CREATE TABLE IF NOT EXISTS mcap_progression (
                                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                token_address TEXT NOT NULL,
                                                milestone REAL NOT NULL, -- 20000, 50000, 100000, etc.
                                                reached_at TIMESTAMP NOT NULL,
                                                time_from_launch_minutes INTEGER, -- how long it took to reach this milestone
                                                price_at_milestone REAL,
                                                volume_at_milestone REAL,
                                                tx_count_to_milestone INTEGER,
                                                unique_buyers_to_milestone INTEGER,
                                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                FOREIGN KEY (token_address) REFERENCES ip_assets (address)
    );

-- Daily token summaries
CREATE TABLE IF NOT EXISTS daily_token_summaries (
                                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                     summary_date DATE NOT NULL,
                                                     tokens_launched INTEGER DEFAULT 0,
                                                     tokens_with_whale_activity INTEGER DEFAULT 0,
                                                     average_time_to_20k INTEGER, -- minutes
                                                     average_time_to_100k INTEGER, -- minutes
                                                     most_active_wallets TEXT, -- JSON array of top wallets
                                                     summary_data TEXT, -- JSON with detailed daily stats
                                                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                     UNIQUE(summary_date)
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_launch_analysis_token ON token_launch_analysis(token_address);
CREATE INDEX IF NOT EXISTS idx_wallet_patterns_wallet_token ON wallet_patterns(wallet_address, token_address);
CREATE INDEX IF NOT EXISTS idx_mcap_progression_token_milestone ON mcap_progression(token_address, milestone);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_token_summaries(summary_date);

COMMIT;
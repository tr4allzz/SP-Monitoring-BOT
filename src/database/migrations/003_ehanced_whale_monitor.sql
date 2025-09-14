-- Enhanced whale monitoring tables
-- Migration for volume-based whale detection and high mcap exclusions

BEGIN;

-- Add volume-based tracking columns to transactions table
ALTER TABLE transactions ADD COLUMN is_whale BOOLEAN DEFAULT 0;
ALTER TABLE transactions ADD COLUMN token_age_hours REAL;
ALTER TABLE transactions ADD COLUMN volume_window TEXT; -- '15s', '30s', '1m', '5m'
ALTER TABLE transactions ADD COLUMN pattern_type TEXT; -- 'single_tx', 'volume_spike', 'coordinated'

-- Token calendars for mcap milestone tracking
CREATE TABLE IF NOT EXISTS token_calendars (
                                               address TEXT PRIMARY KEY,
                                               launch_time TIMESTAMP NOT NULL,
                                               milestones TEXT, -- JSON: {20000: {reached_at, time_from_launch, price}}
                                               analysis_data TEXT, -- JSON: enhanced analysis data
                                               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                               updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Volume patterns tracking for real-time detection
CREATE TABLE IF NOT EXISTS volume_patterns (
                                               id INTEGER PRIMARY KEY AUTOINCREMENT,
                                               token_address TEXT NOT NULL,
                                               window_type TEXT NOT NULL, -- '15s', '30s', '1m', '5m'
                                               volume REAL NOT NULL,
                                               tx_count INTEGER NOT NULL,
                                               unique_wallets INTEGER DEFAULT 1,
                                               avg_tx_size REAL,
                                               first_tx_timestamp TIMESTAMP NOT NULL,
                                               last_tx_timestamp TIMESTAMP NOT NULL,
                                               pattern_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                               alert_sent BOOLEAN DEFAULT 0,
                                               FOREIGN KEY (token_address) REFERENCES ip_assets (address)
    );

-- Token exclusions for high mcap tokens (LARRY, IPPY, ZAZU etc.)
CREATE TABLE IF NOT EXISTS token_exclusions (
                                                address TEXT PRIMARY KEY,
                                                token_name TEXT,
                                                reason TEXT NOT NULL, -- 'high_mcap', 'manual_exclude', 'spam_token'
                                                market_cap REAL,
                                                excluded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                is_active BOOLEAN DEFAULT 1
);

-- Whale alerts enhanced tracking
CREATE TABLE IF NOT EXISTS whale_alerts_enhanced (
                                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                     user_id INTEGER NOT NULL,
                                                     transaction_hash TEXT NOT NULL,
                                                     token_address TEXT NOT NULL,
                                                     alert_type TEXT NOT NULL, -- 'volume_spike', 'large_tx', 'milestone', 'pattern'
                                                     amount REAL NOT NULL,
                                                     volume_window TEXT, -- '15s', '30s', '1m', '5m' for volume alerts
                                                     tx_count INTEGER DEFAULT 1,
                                                     pattern_data TEXT, -- JSON with pattern details
                                                     alert_sent TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                     user_threshold REAL NOT NULL,
                                                     FOREIGN KEY (user_id) REFERENCES users (user_id),
    FOREIGN KEY (token_address) REFERENCES ip_assets (address)
    );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_volume_patterns_token_time ON volume_patterns(token_address, pattern_detected);
CREATE INDEX IF NOT EXISTS idx_volume_patterns_window ON volume_patterns(window_type, pattern_detected);
CREATE INDEX IF NOT EXISTS idx_token_exclusions_active ON token_exclusions(is_active);
CREATE INDEX IF NOT EXISTS idx_transactions_whale ON transactions(is_whale, timestamp);
CREATE INDEX IF NOT EXISTS idx_whale_alerts_enhanced_user ON whale_alerts_enhanced(user_id, alert_sent);

COMMIT;
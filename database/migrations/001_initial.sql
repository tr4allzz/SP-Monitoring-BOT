-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    chat_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    whale_threshold INTEGER DEFAULT 40,
    ip_alerts BOOLEAN DEFAULT 1,
    burn_alerts BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- IP Assets table
CREATE TABLE IF NOT EXISTS ip_assets (
    address TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    creator TEXT NOT NULL,
    initial_supply INTEGER,
    current_supply INTEGER,
    current_price REAL,
    market_cap REAL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    hash TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    token_address TEXT,
    amount REAL,
    value_ip REAL,
    transaction_type TEXT, -- 'buy', 'sell', 'transfer', 'burn'
    block_number INTEGER,
    timestamp TIMESTAMP NOT NULL,
    FOREIGN KEY (token_address) REFERENCES ip_assets (address)
);

-- Watched wallets table
CREATE TABLE IF NOT EXISTS watched_wallets (
    address TEXT PRIMARY KEY,
    nickname TEXT,
    is_whale BOOLEAN DEFAULT 0,
    is_early_buyer BOOLEAN DEFAULT 0,
    success_rate REAL DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    profit_loss REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL, -- 'whale', 'new_ip', 'burn', 'wallet'
    threshold_value REAL,
    target_address TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_token_address ON transactions(token_address);
CREATE INDEX IF NOT EXISTS idx_ip_assets_created_at ON ip_assets(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_user_type ON alerts(user_id, alert_type, is_active);
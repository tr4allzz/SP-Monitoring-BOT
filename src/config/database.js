// src/config/database.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        // Ensure data directory exists
        const dataDir = path.join(__dirname, '..', '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        this.dbPath = path.join(dataDir, 'bot.db');
        this.migrationsPath = path.join(__dirname, '..', 'database', 'migrations'); // ADD THIS LINE
        this.db = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Database connection error:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Connected to SQLite database');
                    resolve();
                }
            });
        });
    }

    async initTables() {
        const createTables = `
      -- Users table (updated with whale_threshold)
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
        created_at TIMESTAMP NOT NULL,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Transactions table (updated for whale tracking)
      CREATE TABLE IF NOT EXISTS transactions (
        hash TEXT PRIMARY KEY,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        token_address TEXT,
        amount REAL,
        value_ip REAL,
        transaction_type TEXT, -- 'buy', 'sell', 'transfer', 'burn'
        timestamp TIMESTAMP NOT NULL,
        is_whale BOOLEAN DEFAULT 0,
        token_age_hours REAL
      );

      -- Watched wallets table
      CREATE TABLE IF NOT EXISTS watched_wallets (
        address TEXT PRIMARY KEY,
        nickname TEXT,
        is_whale BOOLEAN DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Whale alerts table (new)
      CREATE TABLE IF NOT EXISTS whale_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        transaction_hash TEXT NOT NULL,
        amount REAL NOT NULL,
        token_address TEXT NOT NULL,
        alert_sent TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (user_id)
      );
    `;

        return new Promise((resolve, reject) => {
            this.db.exec(createTables, (err) => {
                if (err) {
                    console.error('❌ Error creating tables:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Database tables initialized');
                    resolve();
                }
            });
        });
    }

    // User management
    async createUser(userId, chatId, username = null) {
        const query = `INSERT OR IGNORE INTO users (user_id, chat_id, username) VALUES (?, ?, ?)`;

        return new Promise((resolve, reject) => {
            this.db.run(query, [userId, chatId, username], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async getUser(userId) {
        const query = `SELECT * FROM users WHERE user_id = ?`;

        return new Promise((resolve, reject) => {
            this.db.get(query, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getAllUsers() {
        const query = `SELECT * FROM users WHERE ip_alerts = 1`;

        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // ✅ DODAJ TĘ METODĘ - Update user whale threshold
    // ✅ BEZPIECZNA WERSJA - sprawdza czy kolumna istnieje
    async updateUserWhaleThreshold(userId, threshold) {
        // Najpierw sprawdź czy kolumna updated_at istnieje
        const checkColumn = new Promise((resolve) => {
            this.db.all("PRAGMA table_info(users)", (err, rows) => {
                if (err) {
                    resolve(false);
                } else {
                    const hasUpdatedAt = rows.some(row => row.name === 'updated_at');
                    resolve(hasUpdatedAt);
                }
            });
        });

        const hasUpdatedAt = await checkColumn;

        // Użyj odpowiedniego query w zależności od tego czy kolumna istnieje
        const query = hasUpdatedAt
            ? `UPDATE users SET whale_threshold = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
            : `UPDATE users SET whale_threshold = ? WHERE user_id = ?`;

        return new Promise((resolve, reject) => {
            this.db.run(query, [threshold, userId], function(err) {
                if (err) {
                    console.error('❌ Error updating whale threshold:', err);
                    reject(err);
                } else {
                    console.log(`✅ Updated whale threshold for user ${userId} to ${threshold} IP`);
                    resolve(this.changes);
                }
            });
        });
    }
// Add this method to Database class
    async getIPAsset(address) {
        const query = `SELECT * FROM ip_assets WHERE address = ?`;

        return new Promise((resolve, reject) => {
            this.db.get(query, [address], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    // W klasie Database, dodaj tę metodę po connect()
    async migrate() {
        try {
            console.log('🔄 Checking database schema...');

            // Check if whale columns exist
            const tableInfo = await this.getTableInfo('transactions');
            const hasIsWhale = tableInfo.some(col => col.name === 'is_whale');
            const hasTokenAgeHours = tableInfo.some(col => col.name === 'token_age_hours');

            if (!hasIsWhale) {
                console.log('🔄 Adding is_whale column...');
                await this.addColumn('transactions', 'is_whale', 'BOOLEAN DEFAULT 0');
                console.log('✅ Added is_whale column');
            }

            if (!hasTokenAgeHours) {
                console.log('🔄 Adding token_age_hours column...');
                await this.addColumn('transactions', 'token_age_hours', 'REAL');
                console.log('✅ Added token_age_hours column');
            }

            console.log('✅ Database schema migration completed');
        } catch (error) {
            console.error('❌ Migration error:', error.message);
        }
    }

    async getTableInfo(tableName) {
        return new Promise((resolve, reject) => {
            this.db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async addColumn(tableName, columnName, columnDefinition) {
        return new Promise((resolve, reject) => {
            const query = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`;
            this.db.run(query, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    // IP Assets
    async saveIPAsset(asset) {
        const query = `INSERT OR REPLACE INTO ip_assets 
      (address, name, creator, initial_supply, created_at) 
      VALUES (?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            this.db.run(query, [
                asset.address,
                asset.name,
                asset.creator,
                asset.initialSupply,
                asset.createdAt
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async getRecentIPs(hours = 24) {
        const query = `SELECT * FROM ip_assets 
      WHERE created_at > datetime('now', '-${hours} hours')
      ORDER BY created_at DESC`;

        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // ✅ DODAJ RÓWNIEŻ TE METODY dla whale monitoring
    async saveWhaleTransaction(transaction) {
        const query = `INSERT OR REPLACE INTO transactions 
      (hash, from_address, to_address, token_address, amount, value_ip, transaction_type, timestamp, is_whale, token_age_hours) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            this.db.run(query, [
                transaction.hash,
                transaction.from,
                transaction.to,
                transaction.tokenAddress,
                transaction.amount,
                transaction.valueIP,
                transaction.transactionType,
                transaction.timestamp,
                1, // is_whale = true
                transaction.tokenAgeHours || null
            ], function(err) {
                if (err) {
                    console.error('❌ Error saving whale transaction:', err);
                    reject(err);
                } else {
                    console.log(`✅ Saved whale transaction: ${transaction.hash}`);
                    resolve(this.lastID);
                }
            });
        });
    }

    async getRecentWhaleTransactions(hours = 24) {
        const query = `SELECT t.*, ip.name as token_name FROM transactions t
      LEFT JOIN ip_assets ip ON t.token_address = ip.address
      WHERE t.is_whale = 1 AND t.timestamp > datetime('now', '-${hours} hours')
      ORDER BY t.timestamp DESC`;

        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
    async runMigrations() {
        try {
            // Get current schema version
            const currentVersion = await this.getSchemaVersion();
            console.log(`📊 Current database version: ${currentVersion}`);

            // Get available migrations
            const migrations = await this.getAvailableMigrations();

            // Run pending migrations
            for (const migration of migrations) {
                if (migration.version > currentVersion) {
                    console.log(`🔄 Running migration: ${migration.filename}`);
                    await this.runMigration(migration);
                    await this.setSchemaVersion(migration.version);
                    console.log(`✅ Migration ${migration.filename} completed`);
                }
            }

            console.log('✅ All migrations completed');
        } catch (error) {
            console.error('❌ Migration error:', error);
            throw error;
        }
    }

    async getSchemaVersion() {
        return new Promise((resolve) => {
            this.db.get('PRAGMA user_version', (err, row) => {
                if (err) {
                    console.log('Using default schema version 0');
                    resolve(0);
                } else {
                    resolve(row.user_version);
                }
            });
        });
    }

    async setSchemaVersion(version) {
        return new Promise((resolve, reject) => {
            this.db.run(`PRAGMA user_version = ${version}`, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async getAvailableMigrations() {
        const fs = require('fs');

        if (!fs.existsSync(this.migrationsPath)) {
            console.log('⚠️  No migrations directory found');
            return [];
        }

        const files = fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.sql'))
            .sort();

        return files.map(filename => {
            const versionMatch = filename.match(/^(\d+)_/);
            const version = versionMatch ? parseInt(versionMatch[1]) : 0;

            return {
                filename,
                version,
                path: path.join(this.migrationsPath, filename)
            };
        });
    }

    async runMigration(migration) {
        const fs = require('fs');
        const sql = fs.readFileSync(migration.path, 'utf8');

        return new Promise((resolve, reject) => {
            this.db.exec(sql, (err) => {
                if (err) {
                    console.error(`❌ Error running migration ${migration.filename}:`, err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Add method to manually exclude tokens
    async excludeToken(address, name, reason, marketCap = null) {
        const query = `INSERT OR REPLACE INTO token_exclusions 
            (address, token_name, reason, market_cap, excluded_at) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`;

        return new Promise((resolve, reject) => {
            this.db.run(query, [address, name, reason, marketCap], function(err) {
                if (err) {
                    reject(err);
                } else {
                    console.log(`🚫 Token ${name} excluded: ${reason}`);
                    resolve(this.changes);
                }
            });
        });
    }

    async getExcludedTokens() {
        const query = `SELECT * FROM token_exclusions WHERE is_active = 1`;

        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async logWhaleAlert(userId, transactionHash, amount, tokenAddress) {
        const query = `INSERT INTO whale_alerts (user_id, transaction_hash, amount, token_address) VALUES (?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            this.db.run(query, [userId, transactionHash, amount, tokenAddress], function(err) {
                if (err) {
                    console.error('❌ Error logging whale alert:', err);
                    reject(err);
                } else {
                    console.log(`✅ Logged whale alert for user ${userId}`);
                    resolve(this.lastID);
                }
            });
        });
    }

    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err.message);
                    } else {
                        console.log('✅ Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// Create singleton instance
let database = null;

async function getDatabase() {
    if (!database) {
        database = new Database();
        await database.connect();
        await database.migrate(); // ✅ DODAJ TĘ LINIĘ
        await database.initTables();
    }
    return database;
}

module.exports = { getDatabase, Database };
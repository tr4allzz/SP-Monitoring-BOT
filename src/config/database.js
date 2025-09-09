
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
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        chat_id INTEGER UNIQUE NOT NULL,
        username TEXT,
        whale_threshold INTEGER DEFAULT 40,
        ip_alerts BOOLEAN DEFAULT 1,
        burn_alerts BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

      -- Transactions table
      CREATE TABLE IF NOT EXISTS transactions (
        hash TEXT PRIMARY KEY,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        token_address TEXT,
        amount REAL,
        value_ip REAL,
        transaction_type TEXT,
        timestamp TIMESTAMP NOT NULL
      );

      -- Watched wallets table
      CREATE TABLE IF NOT EXISTS watched_wallets (
        address TEXT PRIMARY KEY,
        nickname TEXT,
        is_whale BOOLEAN DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        await database.initTables();
    }
    return database;
}

module.exports = { getDatabase, Database };

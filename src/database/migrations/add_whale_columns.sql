const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function addWhaleColumns() {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(__dirname, '..', '..', 'data', 'bot.db');
        const db = new sqlite3.Database(dbPath);

        console.log('🔧 Adding whale monitoring columns to database...');

        // Add missing columns
        const alterQueries = [
            'ALTER TABLE transactions ADD COLUMN is_whale BOOLEAN DEFAULT 0',
            'ALTER TABLE transactions ADD COLUMN token_age_hours REAL'
        ];

        let completed = 0;
        let hasErrors = false;

        alterQueries.forEach((query) => {
            db.run(query, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('❌ Error adding column:', err.message);
                    hasErrors = true;
                } else if (err && err.message.includes('duplicate column name')) {
                    console.log('✅ Column already exists (skipping)');
                } else {
                    console.log('✅ Column added successfully');
                }

                completed++;
                if (completed === alterQueries.length) {
                    db.close();
                    if (hasErrors) {
                        reject(new Error('Some columns could not be added'));
                    } else {
                        console.log('✅ Whale monitoring columns added successfully');
                        resolve();
                    }
                }
            });
        });
    });
}

// Run if called directly
if (require.main === module) {
    addWhaleColumns()
        .then(() => {
            console.log('✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((err) => {
            console.error('❌ Migration failed:', err);
            process.exit(1);
        });
}

module.exports = { addWhaleColumns };
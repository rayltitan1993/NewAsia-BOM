// database.js
const sqlite3 = require('sqlite3').verbose();
const DB_SOURCE = "database.sqlite";

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                password TEXT
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                orderNumber TEXT,
                clientName TEXT,
                status TEXT,
                createdAt TEXT,
                completedAt TEXT,
                terminatedAt TEXT,
                boms TEXT,
                FOREIGN KEY (userId) REFERENCES users (id),
                UNIQUE (userId, orderNumber)
            )
        `);
    }
});

module.exports = db;
// server.js (Corrected Version)
const express = require('express');
const session = require('express-session');
const db = require('./database.js');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve static files from 'public' directory

// Session configuration
app.use(session({
    secret: 'a-very-strong-secret-key-for-bom-system', // Replace with a real secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// ========== API ROUTES ==========

// --- Auth Routes ---
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, password], function(err) {
        if (err) {
            return res.status(400).json({ error: "Email already exists" });
        }
        req.session.userId = this.lastID;
        res.json({ message: "Registration successful", userId: this.lastID });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, [email, password], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            req.session.userId = row.id;
            res.json({ message: "Login successful", userId: row.id });
        } else {
            res.status(401).json({ error: "Invalid email or password" });
        }
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Failed to log out' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
    });
});

app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, userId: req.session.userId });
    } else {
        res.json({ loggedIn: false });
    }
});


// --- Order Routes (protected) ---
app.get('/api/orders', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM orders WHERE userId = ?`, [req.session.userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        rows.forEach(row => row.boms = JSON.parse(row.boms || '[]'));
        res.json(rows);
    });
});

app.post('/api/orders', isAuthenticated, (req, res) => {
    const { orderNumber, clientName } = req.body;
    // Check for duplicate orderNumber for the same user
    db.get(`SELECT id FROM orders WHERE userId = ? AND orderNumber = ?`, [req.session.userId, orderNumber], (err, row) => {
        if (err) {
            return res.status(500).json({ error: "Database error checking for duplicate order." });
        }
        if (row) {
            return res.status(400).json({ error: `Order number "${orderNumber}" already exists.` });
        }

        const newOrder = {
            userId: req.session.userId,
            orderNumber,
            clientName,
            status: '进行中',
            createdAt: new Date().toISOString(),
            boms: JSON.stringify([])
        };
        db.run(
            `INSERT INTO orders (userId, orderNumber, clientName, status, createdAt, boms) VALUES (?, ?, ?, ?, ?, ?)`,
            [newOrder.userId, newOrder.orderNumber, newOrder.clientName, newOrder.status, newOrder.createdAt, newOrder.boms],
            function(err) {
                if (err) {
                     return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ id: this.lastID, ...newOrder });
            }
        );
    });
});

app.put('/api/orders/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { status, boms } = req.body;
    
    let query = 'UPDATE orders SET ';
    const params = [];

    if (status) {
        query += 'status = ?, ';
        params.push(status);
        if (status === '已完成') {
            query += 'completedAt = ?, ';
            params.push(new Date().toISOString());
        } else if (status === '订单终止') {
            query += 'terminatedAt = ?, ';
            params.push(new Date().toISOString());
        }
    }
    if (boms) {
        query += 'boms = ?, ';
        params.push(JSON.stringify(boms));
    }
    
    query = query.slice(0, -2); // Remove trailing comma and space
    query += ' WHERE id = ? AND userId = ?';
    params.push(id, req.session.userId);

    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Order not found or user not authorized' });
        }
        res.json({ message: 'Order updated successfully' });
    });
});


// Serve the main HTML file for all other routes that are not API calls
// This regex matches any path that does NOT start with /api
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Access from other devices on the LAN via this computer's IP address.`);
});
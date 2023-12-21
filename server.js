const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const cors = require('cors');
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize SQLite DB
const db = new sqlite3.Database('code_blocks.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

// Create the codeBlocks table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS codeBlocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    code TEXT
)`, (err) => {
    if (err) {
        console.error(err.message);
    } else {
        // Insert the original code blocks if the table is empty
        db.get('SELECT COUNT(*) AS count FROM codeBlocks', (err, row) => {
            if (row.count === 0) {
                const insert = db.prepare('INSERT INTO codeBlocks (title, code) VALUES (?, ?)');
                insert.run(['Hello World', '// A code for Hello world']);
                insert.run(['Statement', '// A code for Statement']);
                insert.run(['Async Case', '// A code for Async Case']);
                insert.run(['Function Declaration', '// A code for Function Declaration']);
                insert.finalize();
            }
        });
    }
});

// Create a mentors table to track which user is a mentor for which code block
db.run(`CREATE TABLE IF NOT EXISTS mentors (
    blockId INTEGER,
    userId TEXT,
    PRIMARY KEY(blockId, userId)
)`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Register a user as a mentor for a code block
app.post('/register', (req, res) => {
    const { userId, blockId } = req.body;
    db.get('SELECT userId FROM mentors WHERE blockId = ?', [blockId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        let isMentor = false;
        if (row) {
            isMentor = row.userId === userId;
        } else {
            // If no mentor is registered for this block, set the current user as the mentor
            db.run('INSERT INTO mentors (blockId, userId) VALUES (?, ?)', [blockId, userId]);
            isMentor = true;
        }
        res.json({ isMentor });
    });
});

// Endpoint to get code blocks
app.get('/codeblocks', (req, res) => {
    db.all('SELECT * FROM codeBlocks', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Socket connection handling
io.on('connection', (socket) => {
    socket.on('codeChange', ({ code, userId, blockId }) => {
        if (!userId || !code || blockId === undefined) {
            return;
        }

        // Update the code in the SQLite database
        db.run('UPDATE codeBlocks SET code = ? WHERE id = ?', [code, blockId], function (err) {
            if (err) {
                console.error(err.message);
                return;
            }

            if (this.changes > 0) {
                // Broadcast the code change to all users, including the sender
                io.emit('codeUpdate', { code, blockId });
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

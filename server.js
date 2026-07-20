const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
// Enable WebSockets with Socket.io
const io = new Server(server, { cors: { origin: '*' } }); 

// Middleware
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./project_manager.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to the SQLite database.');
});

// Initialize Tables if they don't exist (reads from schema.sql)
try {
    const initDb = fs.readFileSync('schema.sql', 'utf8');
    db.exec(initDb, (err) => {
        if (err) console.error("Error creating tables:", err.message);
    });
} catch (err) {
    console.log("Note: schema.sql file not found. Skipping table initialization.");
}

io.on('connection', (socket) => {
    console.log('A user connected via WebSocket:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// --- API ENDPOINTS ---

// 1. Users (Auth Simulation)
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return res.json(row);
        
        // Auto-register if not exists
        db.run(`INSERT INTO users (username) VALUES (?)`, [username], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, username });
        });
    });
});

// 2. Projects
app.get('/api/projects', (req, res) => {
    db.all(`SELECT * FROM projects`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/projects', (req, res) => {
    const { title, ownerId } = req.body;
    db.run(`INSERT INTO projects (title, owner_id) VALUES (?, ?)`, [title, ownerId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        // Emit WebSocket event to all clients
        io.emit('notification', `A new project "${title}" was created!`);
        res.json({ id: this.lastID, title, ownerId });
    });
});

// 3. Tasks
app.get('/api/tasks/:projectId', (req, res) => {
    db.all(`SELECT * FROM tasks WHERE project_id = ?`, [req.params.projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tasks', (req, res) => {
    const { projectId, title, desc, assigneeId } = req.body;
    db.run(`INSERT INTO tasks (project_id, title, desc, status, assignee_id) VALUES (?, ?, ?, 'todo', ?)`, 
    [projectId, title, desc, assigneeId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('notification', `New task added: ${title}`);
        res.json({ id: this.lastID, status: 'todo' });
    });
});

app.put('/api/tasks/:id/status', (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE tasks SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('notification', `A task was moved to ${status}`);
        res.json({ success: true });
    });
});

// 4. Comments
app.post('/api/comments', (req, res) => {
    const { taskId, userId, text } = req.body;
    db.run(`INSERT INTO comments (task_id, user_id, text) VALUES (?, ?, ?)`, 
    [taskId, userId, text], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('notification', `Someone commented on a task`);
        res.json({ id: this.lastID });
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});

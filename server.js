const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware with increased limits
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'client/build')));

// Initialize Database
const db = new sqlite3.Database('./pageant.db', (err) => {
  if (err) {
    console.error('Database error:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS pageants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active BOOLEAN DEFAULT 0,
      completed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS contestants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageant_id INTEGER NOT NULL,
      contestant_number TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      division TEXT,
      beauty BOOLEAN DEFAULT 1,
      photogenic BOOLEAN DEFAULT 0,
      costume BOOLEAN DEFAULT 0,
      checked_in BOOLEAN DEFAULT 0,
      paid BOOLEAN DEFAULT 0,
      balance REAL DEFAULT 0,
      raw_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pageant_id) REFERENCES pageants(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageant_id INTEGER NOT NULL,
      contestant_id INTEGER NOT NULL,
      judge_name TEXT NOT NULL,
      category TEXT NOT NULL,
      scores TEXT NOT NULL,
      total REAL NOT NULL,
      comments TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pageant_id) REFERENCES pageants(id),
      FOREIGN KEY (contestant_id) REFERENCES contestants(id)
    )`);

    console.log('Database tables initialized');
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Pageants
app.get('/api/pageants', (req, res) => {
  db.all('SELECT * FROM pageants ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Get pageants error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/pageants', (req, res) => {
  const { name } = req.body;
  db.run('INSERT INTO pageants (name) VALUES (?)', [name], function(err) {
    if (err) {
      console.error('Create pageant error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, name, active: 0, completed: 0 });
  });
});

app.put('/api/pageants/:id/active', (req, res) => {
  const { id } = req.params;
  db.serialize(() => {
    db.run('UPDATE pageants SET active = 0');
    db.run('UPDATE pageants SET active = 1 WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Set active pageant error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ success: true });
    });
  });
});

app.get('/api/pageants/active', (req, res) => {
  db.get('SELECT * FROM pageants WHERE active = 1', [], (err, row) => {
    if (err) {
      console.error('Get active pageant error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || null);
  });
});

// Contestants
app.get('/api/contestants/:pageantId', (req, res) => {
  const { pageantId } = req.params;
  db.all('SELECT * FROM contestants WHERE pageant_id = ? ORDER BY contestant_number', [pageantId], (err, rows) => {
    if (err) {
      console.error('Get contestants error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(row => ({
      ...row,
      raw_data: row.raw_data ? JSON.parse(row.raw_data) : {}
    })));
  });
});

app.post('/api/contestants', (req, res) => {
  const { pageant_id, name, email, division, beauty, photogenic, costume, raw_data } = req.body;
  const sql = `INSERT INTO contestants (pageant_id, name, email, division, beauty, photogenic, costume, raw_data) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [pageant_id, name, email, division, beauty ? 1 : 0, photogenic ? 1 : 0, costume ? 1 : 0, JSON.stringify(raw_data || {})], function(err) {
    if (err) {
      console.error('Create contestant error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID });
  });
});

app.put('/api/contestants/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, division, beauty, photogenic, costume, contestant_number } = req.body;
  const sql = `UPDATE contestants SET name = ?, email = ?, division = ?, beauty = ?, photogenic = ?, costume = ?, contestant_number = ? WHERE id = ?`;
  
  db.run(sql, [name, email, division, beauty ? 1 : 0, photogenic ? 1 : 0, costume ? 1 : 0, contestant_number, id], function(err) {
    if (err) {
      console.error('Update contestant error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

app.post('/api/contestants/bulk', (req, res) => {
  const { contestants } = req.body;
  
  console.log(`Bulk import: Received ${contestants.length} contestants`);
  
  if (!contestants || contestants.length === 0) {
    return res.status(400).json({ error: 'No contestants provided' });
  }

  const sql = `INSERT INTO contestants (pageant_id, name, email, division, beauty, photogenic, costume, raw_data) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.serialize(() => {
    const stmt = db.prepare(sql);
    let completed = 0;
    let failed = 0;
    
    contestants.forEach((c, index) => {
      stmt.run(
        [
          c.pageant_id, 
          c.name, 
          c.email, 
          c.division || '', 
          c.beauty ? 1 : 0, 
          c.photogenic ? 1 : 0, 
          c.costume ? 1 : 0, 
          JSON.stringify(c.raw_data || {})
        ],
        function(err) {
          if (err) {
            console.error(`Error inserting contestant ${index + 1}:`, err);
            failed++;
          } else {
            completed++;
          }
          
          if (completed + failed === contestants.length) {
            stmt.finalize();
            console.log(`Bulk import complete: ${completed} successful, ${failed} failed`);
            res.json({ success: true, count: completed, failed });
          }
        }
      );
    });
  });
});

app.put('/api/contestants/:id/checkin', (req, res) => {
  const { id } = req.params;
  const { checked_in, contestant_number } = req.body;
  db.run('UPDATE contestants SET checked_in = ?, contestant_number = ? WHERE id = ?', [checked_in ? 1 : 0, contestant_number, id], function(err) {
    if (err) {
      console.error('Check-in error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

app.put('/api/contestants/:id/payment', (req, res) => {
  const { id } = req.params;
  const { paid, balance } = req.body;
  db.run('UPDATE contestants SET paid = ?, balance = ? WHERE id = ?', [paid ? 1 : 0, balance || 0, id], function(err) {
    if (err) {
      console.error('Payment update error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

app.get('/api/divisions/:pageantId', (req, res) => {
  const { pageantId } = req.params;
  db.all('SELECT DISTINCT division FROM contestants WHERE pageant_id = ? AND division IS NOT NULL AND division != "" ORDER BY division', [pageantId], (err, rows) => {
    if (err) {
      console.error('Get divisions error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(r => r.division));
  });
});

// Scores
app.get('/api/scores/:pageantId', (req, res) => {
  const { pageantId } = req.params;
  db.all('SELECT * FROM scores WHERE pageant_id = ?', [pageantId], (err, rows) => {
    if (err) {
      console.error('Get scores error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(row => ({
      ...row,
      scores: JSON.parse(row.scores)
    })));
  });
});

app.post('/api/scores', (req, res) => {
  const { pageant_id, contestant_id, judge_name, category, scores, total, comments } = req.body;
  const sql = `INSERT INTO scores (pageant_id, contestant_id, judge_name, category, scores, total, comments) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [pageant_id, contestant_id, judge_name, category, JSON.stringify(scores), total, comments || null], function(err) {
    if (err) {
      console.error('Create score error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n====================================');
  console.log('Pageant Scoring System is running!');
  console.log('====================================');
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://${localIP}:${PORT}`);
  console.log('====================================\n');
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error(err.message);
    console.log('Database connection closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
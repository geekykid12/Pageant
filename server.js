const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');

// Dependencies for PDF and Mail
require('dotenv').config(); // Load variables from .env
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'client/build')));

// ==========================================================
// ## NODEMAILER TRANSPORTER
// ==========================================================
let transporter;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  transporter.verify((error, success) => {
    if (error) {
      console.error('SMTP Configuration Error:', error);
    } else {
      console.log('Nodemailer is configured and ready to send emails');
    }
  });
} else {
  console.warn('SMTP variables not set in .env. Email sending will be disabled.');
}

// ==========================================================
// ## DATABASE SETUP
// ==========================================================
const db = new sqlite3.Database('./pageant.db', (err) => {
  if (err) {
    console.error('Database error:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function dbRunPromise(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Database run error:', err);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function dbAllPromise(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Database query error:', err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function dbGetPromise(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('Database get error:', err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}


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
      enable_casual_wear BOOLEAN DEFAULT 0,
      date TEXT,
      divisions TEXT,
      judges TEXT,
      validated_divisions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS contestants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageant_id INTEGER NOT NULL,
      contestant_number TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      division TEXT,
      beauty BOOLEAN DEFAULT 1,
      photogenic BOOLEAN DEFAULT 0,
      casual_wear BOOLEAN DEFAULT 0,
      checked_in BOOLEAN DEFAULT 0,
      paid BOOLEAN DEFAULT 0,
      balance REAL DEFAULT 0,
      raw_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pageant_id) REFERENCES pageants(id)
    )`);
    
    // Migrations
    db.all("PRAGMA table_info(contestants)", (err, columns) => {
      if (!columns.some(col => col.name === 'phone')) {
         db.run("ALTER TABLE contestants ADD COLUMN phone TEXT");
      }
    });
    
    db.all("PRAGMA table_info(pageants)", (err, columns) => {
       if (!columns.some(col => col.name === 'date')) {
         db.run("ALTER TABLE pageants ADD COLUMN date TEXT");
       }
       if (!columns.some(col => col.name === 'divisions')) {
         db.run("ALTER TABLE pageants ADD COLUMN divisions TEXT");
       }
       if (!columns.some(col => col.name === 'judges')) {
         db.run("ALTER TABLE pageants ADD COLUMN judges TEXT");
       }
       if (!columns.some(col => col.name === 'validated_divisions')) {
         db.run("ALTER TABLE pageants ADD COLUMN validated_divisions TEXT");
       }
    });

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

// Helper to parse JSON fields safely
const parseJSONField = (field, defaultVal = []) => {
  try {
    const parsed = JSON.parse(field);
    return parsed || defaultVal;
  } catch (e) {
    return defaultVal;
  }
};

// ==========================================================
// ## API ENDPOINTS
// ==========================================================
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Pageants
app.get('/api/pageants', (req, res) => {
  db.all('SELECT * FROM pageants ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Parse JSON fields before sending
    res.json(rows.map(row => ({
      ...row,
      divisions: parseJSONField(row.divisions, []),
      judges: parseJSONField(row.judges, []),
      validated_divisions: parseJSONField(row.validated_divisions, [])
    })));
  });
});

app.post('/api/pageants', (req, res) => {
  const { name, enable_casual_wear, date, divisions, judges } = req.body;
  
  const divisionsJSON = JSON.stringify(divisions || []);
  const judgesJSON = JSON.stringify(judges || ['Judge 1', 'Judge 2', 'Judge 3']); // Default judges
  const validatedDivisionsJSON = JSON.stringify([]);

  const sql = `INSERT INTO pageants (name, enable_casual_wear, date, divisions, judges, validated_divisions) 
               VALUES (?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [name, enable_casual_wear ? 1 : 0, date || null, divisionsJSON, judgesJSON, validatedDivisionsJSON], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ 
      id: this.lastID, 
      name, 
      active: 0, 
      completed: 0, 
      enable_casual_wear: enable_casual_wear ? 1 : 0,
      date: date || null,
      divisions: divisions || [],
      judges: judges || ['Judge 1', 'Judge 2', 'Judge 3'],
      validated_divisions: []
    });
  });
});

// NEW: Update Pageant
app.put('/api/pageants/:id', (req, res) => {
  const { id } = req.params;
  const { name, enable_casual_wear, date, divisions, judges } = req.body;

  const divisionsJSON = JSON.stringify(divisions || []);
  const judgesJSON = JSON.stringify(judges || []);

  const sql = `UPDATE pageants SET 
               name = ?, 
               enable_casual_wear = ?, 
               date = ?, 
               divisions = ?, 
               judges = ? 
               WHERE id = ?`;

  db.run(sql, [name, enable_casual_wear ? 1 : 0, date, divisionsJSON, judgesJSON, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Pageant not found' });
    res.json({ success: true });
  });
});

app.put('/api/pageants/:id/active', (req, res) => {
  const { id } = req.params;
  db.serialize(() => {
    db.run('UPDATE pageants SET active = 0');
    db.run('UPDATE pageants SET active = 1 WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.get('/api/pageants/active', (req, res) => {
  db.get('SELECT * FROM pageants WHERE active = 1', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json(null);
    // Parse JSON fields
    res.json({
      ...row,
      divisions: parseJSONField(row.divisions, []),
      judges: parseJSONField(row.judges, []),
      validated_divisions: parseJSONField(row.validated_divisions, [])
    });
  });
});

// NEW: Validate Division (for Tabulator)
app.post('/api/pageants/:pageantId/validate_division', async (req, res) => {
  const { pageantId } = req.params;
  const { division } = req.body;

  if (!division) {
    return res.status(400).json({ error: 'Division is required' });
  }

  try {
    const pageant = await dbGetPromise('SELECT * FROM pageants WHERE id = ?', [pageantId]);
    if (!pageant) {
      return res.status(404).json({ error: 'Pageant not found' });
    }

    const validatedDivisions = parseJSONField(pageant.validated_divisions, []);
    
    if (!validatedDivisions.includes(division)) {
      validatedDivisions.push(division);
      const validatedDivisionsJSON = JSON.stringify(validatedDivisions);
      await dbRunPromise('UPDATE pageants SET validated_divisions = ? WHERE id = ?', [validatedDivisionsJSON, pageantId]);
    }
    
    res.json({ success: true, validated_divisions: validatedDivisions });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contestants
app.get('/api/contestants/:pageantId', (req, res) => {
  const { pageantId } = req.params;
  db.all('SELECT * FROM contestants WHERE pageant_id = ? ORDER BY contestant_number', [pageantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({
      ...row,
      raw_data: row.raw_data ? JSON.parse(row.raw_data) : {}
    })));
  });
});

app.post('/api/contestants', (req, res) => {
  const { pageant_id, name, email, phone, division, beauty, photogenic, casual_wear, raw_data } = req.body;
  const sql = `INSERT INTO contestants (pageant_id, name, email, phone, division, beauty, photogenic, casual_wear, raw_data) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [pageant_id, name, email, phone || null, division, beauty ? 1 : 0, photogenic ? 1 : 0, casual_wear ? 1 : 0, JSON.stringify(raw_data || {})], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.put('/api/contestants/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, phone, division, beauty, photogenic, casual_wear, contestant_number } = req.body;
  const sql = `UPDATE contestants SET name = ?, email = ?, phone = ?, division = ?, beauty = ?, photogenic = ?, casual_wear = ?, contestant_number = ? WHERE id = ?`;
  db.run(sql, [name, email, phone || null, division, beauty ? 1 : 0, photogenic ? 1 : 0, casual_wear ? 1 : 0, contestant_number, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/contestants/bulk', (req, res) => {
  const { contestants } = req.body;
  if (!contestants || contestants.length === 0) {
    return res.status(400).json({ error: 'No contestants provided' });
  }
  const sql = `INSERT INTO contestants (pageant_id, name, email, division, beauty, photogenic, casual_wear, raw_data) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.serialize(() => {
    const stmt = db.prepare(sql);
    let completed = 0;
    let failed = 0;
    contestants.forEach((c, index) => {
      stmt.run(
        [c.pageant_id, c.name, c.email, c.division || '', c.beauty ? 1 : 0, c.photogenic ? 1 : 0, c.casual_wear ? 1 : 0, JSON.stringify(c.raw_data || {})],
        function(err) {
          if (err) {
            console.error(`Error inserting contestant ${index + 1}:`, err);
            failed++;
          } else {
            completed++;
          }
          if (completed + failed === contestants.length) {
            stmt.finalize();
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
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.put('/api/contestants/:id/payment', (req, res) => {
  const { id } = req.params;
  const { paid, balance } = req.body;
  db.run('UPDATE contestants SET paid = ?, balance = ? WHERE id = ?', [paid ? 1 : 0, balance || 0, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// MODIFIED: Get divisions from pageant table
app.get('/api/divisions/:pageantId', async (req, res) => {
  const { pageantId } = req.params;
  try {
    const row = await dbGetPromise('SELECT divisions FROM pageants WHERE id = ?', [pageantId]);
    if (row) {
      res.json(parseJSONField(row.divisions, []));
    } else {
      res.json([]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================
// ## SCORES API
// ==========================================================

// Get all scores for a pageant (for Tabulator)
app.get('/api/scores/:pageantId', (req, res) => {
  const { pageantId } = req.params;
  db.all('SELECT * FROM scores WHERE pageant_id = ?', [pageantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({
      ...row,
      scores: JSON.parse(row.scores) // Parse the JSON string
    })));
  });
});

// Get all scores for a specific judge (for Judge read-only view)
app.get('/api/scores/judge/:pageantId/:judgeName', (req, res) => {
  const { pageantId, judgeName } = req.params;
  db.all('SELECT * FROM scores WHERE pageant_id = ? AND judge_name = ?', [pageantId, judgeName], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => ({
      ...row,
      scores: JSON.parse(row.scores) // Parse the JSON string
    })));
  });
});

// Submit a new score (for Judge)
app.post('/api/scores', (req, res) => {
  const { pageant_id, contestant_id, judge_name, category, scores, total, comments } = req.body;

  const safeTotal = Number(total);
  if (isNaN(safeTotal)) {
    console.warn('Invalid total received:', total, '-> defaulting to 0');
  }
  const finalTotal = isNaN(safeTotal) ? 0 : safeTotal;

  const checkSql = `
    SELECT id FROM scores
    WHERE pageant_id = ? AND contestant_id = ? AND judge_name = ? AND category = ?
  `;
  db.get(checkSql, [pageant_id, contestant_id, judge_name, category], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(409).json({ error: 'Score already submitted' });

    const sql = `
      INSERT INTO scores (pageant_id, contestant_id, judge_name, category, scores, total, comments)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [pageant_id, contestant_id, judge_name, category, JSON.stringify(scores || {}), finalTotal, comments || null],
      function (err) {
        if (err) {
          console.error('Error inserting score:', err);
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID });
      }
    );
  });
});


// Update an existing score (for Tabulator)
app.put('/api/scores/:id', (req, res) => {
  const { id } = req.params;
  const { scores, total, comments } = req.body;
  
  const sql = `UPDATE scores SET scores = ?, total = ?, comments = ? WHERE id = ?`;
  
  db.run(sql, [JSON.stringify(scores), total, comments, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changed: this.changes });
  });
});

// ==========================================================
// ## PDF Generation and Email Endpoint (Unchanged logic)
// ==========================================================
app.post('/api/scores/send', async (req, res) => {
  if (!transporter) {
    return res.status(500).json({ error: 'SMTP server is not configured. Emails disabled.' });
  }

  const { pageantId, division } = req.body; 
  const PAGEANT_NAME = process.env.PAGEANT_NAME || "Pageant Score Sheet";

  if (!division) {
    return res.status(400).json({ error: 'A division must be selected to send scores.' });
  }

  try {
    const contestants = await dbAllPromise('SELECT * FROM contestants WHERE pageant_id = ? AND division = ? AND email IS NOT NULL AND email != ""', [pageantId, division]);
    const allScores = await dbAllPromise('SELECT * FROM scores WHERE pageant_id = ?', [pageantId]);

    let sent = 0;
    for (const contestant of contestants) {
      const contestantScores = allScores.filter(s => s.contestant_id === contestant.id);
      if (contestantScores.length === 0) continue; 

      const pdfBuffer = await generateScoreSheetPdf(contestant, contestantScores, PAGEANT_NAME);

      const mailOptions = {
        from: process.env.SMTP_FROM_EMAIL,
        to: contestant.email,
        subject: `Your Score Sheet for ${PAGEANT_NAME}`,
        text: `Hi ${contestant.name},\n\nPlease find your score sheet attached.\n\nThank you for participating!`,
        attachments: [
          {
            filename: `Score_Sheet_${contestant.name.replace(' ', '_')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${contestant.email}`);
        sent++;
      } catch (emailError) {
        console.error(`Failed to send email to ${contestant.email}:`, emailError);
      }
    }
    res.json({ success: true, sent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve data for sending scores' });
  }
});

// PDF Generation Helper (Unchanged)
function generateScoreSheetPdf(contestant, scores, pageantName) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });

    // Header
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(pageantName, { align: 'center' });
    doc.moveDown();

    // Contestant Info
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(`${contestant.name} (#${contestant.contestant_number || 'N/A'})`, { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Division: ${contestant.division || 'N/A'}`, { align: 'center' });
    doc.moveDown(2);

    // Group scores by category
    const scoresByCategory = {};
    scores.forEach(score => {
      if (!scoresByCategory[score.category]) {
        scoresByCategory[score.category] = [];
      }
      scoresByCategory[score.category].push(score);
    });

    let finalTotal = 0;

    // Loop through categories and add to PDF
    for (const category of Object.keys(scoresByCategory)) {
      const catScores = scoresByCategory[category];
      const catName = category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      doc.fontSize(14).font('Helvetica-Bold').text(catName, { underline: true });
      doc.moveDown(0.5);

      let categoryTotal = 0;
      catScores.forEach(score => {
        doc.fontSize(10).font('Helvetica');
        doc.text(`${score.judge_name}: ${score.total.toFixed(1)}`);
        
        // Add criteria breakdown
        const criteriaScores = score.scores; // Already parsed
        doc.font('Helvetica-Oblique').list(Object.entries(criteriaScores).map(([key, value]) => `${key}: ${value}`), {
          bulletRadius: 2,
          indent: 20,
          textIndent: 8,
        });

        if (score.comments) {
          doc.font('Helvetica-Oblique').fillColor('grey').text(`Comment: "${score.comments}"`, { indent: 20 });
        }
        
        doc.fillColor('black'); // Reset color
        doc.moveDown(0.5);
        categoryTotal += score.total;
      });
      
      const avgCategoryScore = (categoryTotal / catScores.length).toFixed(2);
      doc.fontSize(10).font('Helvetica-Bold').text(`Category Total: ${categoryTotal.toFixed(1)} (Avg: ${avgCategoryScore})`);
      doc.moveDown(1.5);
      
      finalTotal += categoryTotal;
    }
    
    // Final Total
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica-Bold').text(`Final Combined Score: ${finalTotal.toFixed(1)}`);

    doc.end();
  });
}

// ==========================================================
// ## APP STARTUP
// ==========================================================
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
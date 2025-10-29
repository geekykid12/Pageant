#!/bin/bash

echo "======================================"
echo "Pageant Scoring System Setup"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}Please do not run as root/sudo${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Installing Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
echo -e "${GREEN}Node.js installed: $(node --version)${NC}"
echo ""

echo -e "${YELLOW}Step 2: Creating project directory...${NC}"
mkdir -p ~/pageant-scoring-system
cd ~/pageant-scoring-system
echo -e "${GREEN}Directory created${NC}"
echo ""

echo -e "${YELLOW}Step 3: Setting up backend...${NC}"

# Create package.json
cat > package.json << 'EOF'
{
  "name": "pageant-scoring-system",
  "version": "1.0.0",
  "description": "Beauty Pageant Scoring System",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "build": "cd client && npm run build",
    "install-all": "npm install && cd client && npm install"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "nodemailer": "^6.9.7",
    "pdfkit": "^0.13.0",
    "papaparse": "^5.4.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

# Download server.js
cat > server.js << 'SERVEREOF'
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
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
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Pageants table
    db.run(`CREATE TABLE IF NOT EXISTS pageants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active BOOLEAN DEFAULT 0,
      completed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Contestants table
    db.run(`CREATE TABLE IF NOT EXISTS contestants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
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

    // Scores table
    db.run(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageant_id INTEGER NOT NULL,
      contestant_id INTEGER NOT NULL,
      judge_name TEXT NOT NULL,
      category TEXT NOT NULL,
      scores TEXT NOT NULL,
      total INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pageant_id) REFERENCES pageants(id),
      FOREIGN KEY (contestant_id) REFERENCES contestants(id)
    )`);

    console.log('Database tables initialized');
  });
}

// API Routes

// Pageants
app.get('/api/pageants', (req, res) => {
  db.all('SELECT * FROM pageants ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
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
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || null);
  });
});

// Contestants
app.get('/api/contestants/:pageantId', (req, res) => {
  const { pageantId } = req.params;
  db.all('SELECT * FROM contestants WHERE pageant_id = ?', [pageantId], (err, rows) => {
    if (err) {
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
  const { pageant_id, name, email, beauty, photogenic, costume, raw_data } = req.body;
  const sql = `INSERT INTO contestants (pageant_id, name, email, beauty, photogenic, costume, raw_data) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [pageant_id, name, email, beauty ? 1 : 0, photogenic ? 1 : 0, costume ? 1 : 0, JSON.stringify(raw_data || {})], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID });
  });
});

app.post('/api/contestants/bulk', (req, res) => {
  const { contestants } = req.body;
  const stmt = db.prepare(`INSERT INTO contestants (pageant_id, name, email, beauty, photogenic, costume, raw_data) 
                           VALUES (?, ?, ?, ?, ?, ?, ?)`);
  
  db.serialize(() => {
    contestants.forEach(c => {
      stmt.run([c.pageant_id, c.name, c.email, c.beauty ? 1 : 0, c.photogenic ? 1 : 0, c.costume ? 1 : 0, JSON.stringify(c.raw_data || {})]);
    });
    stmt.finalize((err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ success: true, count: contestants.length });
    });
  });
});

app.put('/api/contestants/:id/checkin', (req, res) => {
  const { id } = req.params;
  const { checked_in } = req.body;
  db.run('UPDATE contestants SET checked_in = ? WHERE id = ?', [checked_in ? 1 : 0, id], function(err) {
    if (err) {
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
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

// Scores
app.get('/api/scores/:pageantId', (req, res) => {
  const { pageantId } = req.params;
  db.all('SELECT * FROM scores WHERE pageant_id = ?', [pageantId], (err, rows) => {
    if (err) {
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
  const { pageant_id, contestant_id, judge_name, category, scores, total } = req.body;
  const sql = `INSERT INTO scores (pageant_id, contestant_id, judge_name, category, scores, total) 
               VALUES (?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [pageant_id, contestant_id, judge_name, category, JSON.stringify(scores), total], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID });
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Get local IP address
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n====================================');
  console.log('Pageant Scoring System is running!');
  console.log('====================================');
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://${localIP}:${PORT}`);
  console.log('====================================\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed');
    process.exit(0);
  });
});
SERVEREOF

npm install

echo -e "${GREEN}Backend setup complete${NC}"
echo ""

echo -e "${YELLOW}Step 4: Creating React frontend...${NC}"
npx create-react-app client --template cra-template

cd client
npm install lucide-react axios

# Create API service
mkdir -p src/services
cat > src/services/api.js << 'APIEOF'
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Pageants
export const getPageants = () => api.get('/pageants');
export const createPageant = (name) => api.post('/pageants', { name });
export const setActivePageant = (id) => api.put(`/pageants/${id}/active`);
export const getActivePageant = () => api.get('/pageants/active');

// Contestants
export const getContestants = (pageantId) => api.get(`/contestants/${pageantId}`);
export const createContestant = (data) => api.post('/contestants', data);
export const bulkCreateContestants = (contestants) => api.post('/contestants/bulk', { contestants });
export const updateCheckIn = (id, checked_in) => api.put(`/contestants/${id}/checkin`, { checked_in });
export const updatePayment = (id, paid, balance) => api.put(`/contestants/${id}/payment`, { paid, balance });

// Scores
export const getScores = (pageantId) => api.get(`/scores/${pageantId}`);
export const createScore = (data) => api.post('/scores', data);

export default api;
APIEOF

echo "Creating complete React App.js..."
cat > src/App.js << 'APPEOF'
import React, { useState, useEffect } from 'react';
import { Upload, Award, Mail, Plus, AlertTriangle, Search } from 'lucide-react';
import * as api from './services/api';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [pageants, setPageants] = useState([]);
  const [activePageantId, setActivePageantId] = useState(null);
  const [contestants, setContestants] = useState([]);
  const [scores, setScores] = useState([]);
  const [selectedContestant, setSelectedContestant] = useState(null);
  const [category, setCategory] = useState('beauty');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPageants();
  }, []);

  useEffect(() => {
    if (activePageantId) {
      loadContestants();
      loadScores();
    }
  }, [activePageantId]);

  const loadPageants = async () => {
    try {
      const response = await api.getPageants();
      setPageants(response.data);
      const active = response.data.find(p => p.active);
      if (active) setActivePageantId(active.id);
    } catch (error) {
      console.error('Error loading pageants:', error);
    }
  };

  const loadContestants = async () => {
    try {
      const response = await api.getContestants(activePageantId);
      setContestants(response.data);
    } catch (error) {
      console.error('Error loading contestants:', error);
    }
  };

  const loadScores = async () => {
    try {
      const response = await api.getScores(activePageantId);
      setScores(response.data);
    } catch (error) {
      console.error('Error loading scores:', error);
    }
  };

  const getActivePageant = () => pageants.find(p => p.id === activePageantId);
  const getActiveContestants = () => contestants.filter(c => c.pageant_id === activePageantId);
  const getCheckedInContestants = () => getActiveContestants().filter(c => c.checked_in);

  const LoginScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <Award className="w-16 h-16 mx-auto text-purple-600 mb-4" />
          <h1 className="text-3xl font-bold text-gray-800">Pageant Scoring System</h1>
          <p className="text-gray-600 mt-2">Select your role to continue</p>
        </div>
        <div className="space-y-3">
          {['Registrar', 'Judge 1', 'Judge 2', 'Judge 3', 'Tabulator'].map(role => (
            <button
              key={role}
              onClick={() => setUser(role)}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 transform hover:scale-105"
            >
              {role}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const RegistrarDashboard = () => {
    const [csvData, setCsvData] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [showAddContestant, setShowAddContestant] = useState(false);
    const [newContestant, setNewContestant] = useState({
      name: '', email: '', beauty: true, photogenic: false, costume: false
    });
    const [newPageantName, setNewPageantName] = useState('');
    const [emailStatus, setEmailStatus] = useState('');
    const [viewMode, setViewMode] = useState('contestants');

    const createPageant = async () => {
      if (!newPageantName.trim()) return;
      try {
        const response = await api.createPageant(newPageantName);
        setNewPageantName('');
        await loadPageants();
        await api.setActivePageant(response.data.id);
        setActivePageantId(response.data.id);
      } catch (error) {
        console.error('Error creating pageant:', error);
        alert('Error creating pageant');
      }
    };

    const parseCSV = (csvText) => {
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name') && !h.toLowerCase().includes('parent'));
      const emailIndex = headers.findIndex(h => h.toLowerCase().includes('email'));
      const photogenicIndex = headers.findIndex(h => h.toLowerCase().includes('photogenic'));
      const costumeIndex = headers.findIndex(h => h.toLowerCase().includes('costume') || h.toLowerCase().includes('casual'));
      
      return lines.slice(1).map((line) => {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());
        
        const rawData = {};
        headers.forEach((header, i) => {
          rawData[header] = values[i] || '';
        });
        
        return {
          pageant_id: activePageantId,
          name: values[nameIndex] || 'Unknown',
          email: values[emailIndex] || '',
          beauty: true,
          photogenic: photogenicIndex >= 0 ? values[photogenicIndex]?.toLowerCase() === 'yes' : false,
          costume: costumeIndex >= 0 ? values[costumeIndex]?.toLowerCase() === 'yes' : false,
          raw_data: rawData
        };
      });
    };

    const handleCSVImport = async () => {
      if (!activePageantId) {
        alert('Please create or select an active pageant first');
        return;
      }

      try {
        setLoading(true);
        const newContestants = parseCSV(csvData);
        await api.bulkCreateContestants(newContestants);
        setCsvData('');
        setShowImport(false);
        await loadContestants();
        alert(`Successfully imported ${newContestants.length} contestants!`);
      } catch (error) {
        alert('Error importing CSV. Please check the format.');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    const addManualContestant = async () => {
      if (!activePageantId) {
        alert('Please create or select an active pageant first');
        return;
      }
      if (!newContestant.name || !newContestant.email) {
        alert('Name and email are required');
        return;
      }

      try {
        await api.createContestant({
          ...newContestant,
          pageant_id: activePageantId
        });
        setNewContestant({ name: '', email: '', beauty: true, photogenic: false, costume: false });
        setShowAddContestant(false);
        await loadContestants();
      } catch (error) {
        console.error('Error adding contestant:', error);
        alert('Error adding contestant');
      }
    };

    const toggleCheckIn = async (id, currentStatus) => {
      try {
        await api.updateCheckIn(id, !currentStatus);
        await loadContestants();
      } catch (error) {
        console.error('Error updating check-in:', error);
      }
    };

    const updatePaymentField = async (id, field, value) => {
      const contestant = contestants.find(c => c.id === id);
      if (!contestant) return;

      try {
        if (field === 'paid') {
          await api.updatePayment(id, value, contestant.balance);
        } else if (field === 'balance') {
          await api.updatePayment(id, contestant.paid, value);
        }
        await loadContestants();
      } catch (error) {
        console.error('Error updating payment:', error);
      }
    };

    const sendScoreSheets = async () => {
      if (!activePageantId) return;
      
      setEmailStatus('Preparing score sheets...');
      
      const activeContestants = getActiveContestants();
      let sent = 0;
      
      for (const contestant of activeContestants) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setEmailStatus(`Sending to ${contestant.name} (${++sent}/${activeContestants.length})...`);
      }
      
      setEmailStatus(`Successfully sent ${sent} score sheets!`);
      setTimeout(() => setEmailStatus(''), 3000);
    };

    const setActivePageantHandler = async (id) => {
      try {
        await api.setActivePageant(id);
        setActivePageantId(id);
        await loadPageants();
      } catch (error) {
        console.error('Error setting active pageant:', error);
      }
    };

    const activeContestants = getActiveContestants();
    const activePageant = getActivePageant();
    
    const filteredContestants = activeContestants.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const unpaidTotal = activeContestants.reduce((sum, c) => sum + (c.paid ? 0 : c.balance), 0);
    const paidCount = activeContestants.filter(c => c.paid).length;

    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800">Registrar Dashboard</h2>
          <button
            onClick={() => setUser(null)}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold text-xl mb-4">Pageant Management</h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newPageantName}
              onChange={(e) => setNewPageantName(e.target.value)}
              placeholder="New Pageant Name"
              className="flex-1 border rounded p-2"
            />
            <button
              onClick={createPageant}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
            >
              Create Pageant
            </button>
          </div>
          <div className="space-y-2">
            {pageants.map(p => (
              <div
                key={p.id}
                className={`flex justify-between items-center p-3 rounded cursor-pointer ${
                  p.id === activePageantId ? 'bg-purple-100 border-2 border-purple-600' : 'bg-gray-50'
                }`}
                onClick={() => setActivePageantHandler(p.id)}
              >
                <div>
                  <span className="font-semibold">{p.name}</span>
                  {p.completed === 1 && <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Completed</span>}
                </div>
                {p.id === activePageantId && <span className="text-purple-600 font-bold">ACTIVE</span>}
              </div>
            ))}
          </div>
        </div>

        {activePageant && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <button
                onClick={() => setShowImport(!showImport)}
                className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg flex items-center justify-center space-x-2"
              >
                <Upload className="w-5 h-5" />
                <span>Import CSV</span>
              </button>
              <button
                onClick={() => setShowAddContestant(!showAddContestant)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-lg flex items-center justify-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Add Contestant</span>
              </button>
              <button
                onClick={sendScoreSheets}
                disabled={activeContestants.length === 0}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white p-4 rounded-lg flex items-center justify-center space-x-2"
              >
                <Mail className="w-5 h-5" />
                <span>Send Scores</span>
              </button>
              <div className="bg-purple-100 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-800">{activeContestants.length}</div>
                <div className="text-xs text-purple-600">Total</div>
              </div>
              <div className="bg-green-100 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-800">{paidCount}/{activeContestants.length}</div>
                <div className="text-xs text-green-600">Paid</div>
              </div>
            </div>

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setViewMode('contestants')}
                className={`px-4 py-2 rounded ${viewMode === 'contestants' ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}
              >
                Contestants
              </button>
              <button
                onClick={() => setViewMode('payments')}
                className={`px-4 py-2 rounded ${viewMode === 'payments' ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}
              >
                Payments
              </button>
            </div>

            {emailStatus && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
                <p className="text-blue-800 font-medium">{emailStatus}</p>
              </div>
            )}

            {showImport && (
              <div className="bg-white border-2 border-blue-300 rounded-lg p-4 mb-6">
                <h3 className="font-semibold mb-2">Import Contestants (CSV Format)</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Paste your CSV data below. System will auto-detect columns.
                </p>
                <textarea
                  value={csvData}
                  onChange={(e) => setCsvData(e.target.value)}
                  className="w-full border rounded p-2 mb-2 font-mono text-sm"
                  rows="8"
                  placeholder="Paste CSV here..."
                />
                <button
                  onClick={handleCSVImport}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded"
                >
                  {loading ? 'Importing...' : 'Import'}
                </button>
              </div>
            )}

            {showAddContestant && (
              <div className="bg-white border-2 border-indigo-300 rounded-lg p-4 mb-6">
                <h3 className="font-semibold mb-4">Add Walk-In Contestant</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <input
                    type="text"
                    placeholder="Name"
                    value={newContestant.name}
                    onChange={(e) => setNewContestant({ ...newContestant, name: e.target.value })}
                    className="border rounded p-2"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newContestant.email}
                    onChange={(e) => setNewContestant({ ...newContestant, email: e.target.value })}
                    className="border rounded p-2"
                  />
                </div>
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newContestant.photogenic}
                      onChange={(e) => setNewContestant({ ...newContestant, photogenic: e.target.checked })}
                      className="mr-2"
                    />
                    Photogenic
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newContestant.costume}
                      onChange={(e) => setNewContestant({ ...newContestant, costume: e.target.checked })}
                      className="mr-2"
                    />
                    Costume
                  </label>
                </div>
                <button
                  onClick={addManualContestant}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
                >
                  Add Contestant
                </button>
              </div>
            )}

            <div className="bg-white rounded-lg shadow mb-6">
              <div className="bg-gray-100 px-4 py-3 border-b flex justify-between items-center">
                <h3 className="font-semibold text-lg">{activePageant.name}</h3>
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              
              {viewMode === 'contestants' ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left">Name</th>
                        <th className="px-4 py-3 text-left">Email</th>
                        <th className="px-4 py-3 text-center">Categories</th>
                        <th className="px-4 py-3 text-center">Check-In</th>
                        <th className="px-4 py-3 text-center">Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContestants.map(c => (
                        <tr key={c.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{c.email}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center space-x-2">
                              <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">Beauty</span>
                              {c.photogenic === 1 && <span className="bg-pink-100 text-pink-800 text-xs px-2 py-1 rounded">Photo</span>}
                              {c.costume === 1 && <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Costume</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => toggleCheckIn(c.id, c.checked_in)}
                              className={`px-4 py-2 rounded font-medium ${
                                c.checked_in === 1
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                            >
                              {c.checked_in === 1 ? 'Checked In' : 'Check In'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.paid === 1 ? (
                              <span className="bg-green-100 text-green-800 px-3 py-1 rounded font-medium">Paid</span>
                            ) : (
                              <span className="bg-red-100 text-red-800 px-3 py-1 rounded font-medium">${c.balance || 0}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4">
                  <div className="mb-4 bg-red-50 border border-red-200 rounded p-4">
                    <div className="text-2xl font-bold text-red-800">${unpaidTotal.toFixed(2)}</div>
                    <div className="text-sm text-red-600">Total Outstanding Balance</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left">Name</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-center">Balance</th>
                          <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredContestants.map(c => (
                          <tr key={c.id} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{c.name}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => updatePaymentField(c.id, 'paid', c.paid === 1 ? 0 : 1)}
                                className={`px-3 py-1 rounded font-medium ${
                                  c.paid === 1
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {c.paid === 1 ? 'Paid' : 'Unpaid'}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="number"
                                value={c.balance || 0}
                                onChange={(e) => updatePaymentField(c.id, 'balance', parseFloat(e.target.value) || 0)}
                                className="w-24 border rounded px-2 py-1 text-center"
                                step="0.01"
                                disabled={c.paid === 1}
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={async () => {
                                  await api.updatePayment(c.id, true, 0);
                                  await loadContestants();
                                }}
                                disabled={c.paid === 1}
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm"
                              >
                                Mark Paid
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const JudgeDashboard = () => {
    const [currentScores, setCurrentScores] = useState({});

    const criteria = {
      beauty: ['Poise', 'Confidence', 'Stage Presence', 'Overall Impression'],
      photogenic: ['Photo Quality', 'Expression', 'Composition'],
      costume: ['Creativity', 'Fit', 'Theme Adherence', 'Overall Effect']
    };

    const checkedInContestants = getCheckedInContestants().filter(c => c[category] === 1);
    const activePageant = getActivePageant();

    const handleScoreChange = (criterion, value) => {
      setCurrentScores(prev => ({
        ...prev,
        [criterion]: parseInt(value)
      }));
    };

    const submitScore = async () => {
      if (!selectedContestant) return;
      
      const total = Object.values(currentScores).reduce((a, b) => a + b, 0);
      
      try {
        await api.createScore({
          pageant_id: activePageantId,
          contestant_id: selectedContestant.id,
          judge_name: user,
          category,
          scores: currentScores,
          total
        });
        
        setCurrentScores({});
        setSelectedContestant(null);
        await loadScores();
        alert('Score submitted successfully!');
      } catch (error) {
        console.error('Error submitting score:', error);
        alert('Error submitting score');
      }
    };

    if (!activePageantId) {
      return (
        <div className="p-6 max-w-4xl mx-auto">
          <div className="text-center py-12">
            <Award className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 text-lg">No active pageant.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">{user} Dashboard</h2>
            <p className="text-gray-600">Pageant: {activePageant?.name}</p>
          </div>
          <button
            onClick={() => setUser(null)}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label className="block mb-2 font-semibold">Select Category:</label>
          <div className="flex space-x-2 mb-4">
            {['beauty', 'photogenic', 'costume'].map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setCategory(cat);
                  setSelectedContestant(null);
                  setCurrentScores({});
                }}
                className={`px-4 py-2 rounded capitalize ${category === cat ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <label className="block mb-2 font-semibold">Select Contestant (Checked In Only):</label>
          <select
            value={selectedContestant?.id || ''}
            onChange={(e) => {
              const contestant = checkedInContestants.find(c => c.id === parseInt(e.target.value));
              setSelectedContestant(contestant);
              setCurrentScores({});
            }}
            className="w-full border rounded p-2 mb-4"
          >
            <option value="">-- Select Contestant --</option>
            {checkedInContestants.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {checkedInContestants.length === 0 && (
            <p className="text-amber-600 bg-amber-50 p-3 rounded mb-4">
              No checked-in contestants for this category yet.
            </p>
          )}

          {selectedContestant && (
            <div className="space-y-4">
              <div className="bg-purple-50 p-4 rounded">
                <h3 className="text-xl font-semibold mb-4">Score {selectedContestant.name} - {category}</h3>
                {criteria[category].map(criterion => (
                  <div key={criterion} className="mb-4">
                    <label className="block mb-1 font-medium">{criterion} (1-10)</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={currentScores[criterion] || ''}
                      onChange={(e) => handleScoreChange(criterion, e.target.value)}
                      className="w-full border rounded p-2"
                    />
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t">
                  <div className="text-lg font-bold">
                    Total: {Object.values(currentScores).reduce((a, b) => a + b, 0)} / {criteria[category].length * 10}
                  </div>
                </div>
              </div>
              <button
                onClick={submitScore}
                disabled={Object.keys(currentScores).length !== criteria[category].length}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white py-3 rounded font-semibold"
              >
                Submit Score
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const TabulatorDashboard = () => {
    const [tieBreakRequest, setTieBreakRequest] = useState(null);
    
    const activePageant = getActivePageant();
    
    const scoresByContestant = {};
    
    scores.forEach(score => {
      const contestant = contestants.find(c => c.id === score.contestant_id);
      if (contestant && contestant.pageant_id === activePageantId) {
        if (!scoresByContestant[score.contestant_id]) {
          scoresByContestant[score.contestant_id] = {
            name: contestant.name,
            categories: {}
          };
        }
        if (!scoresByContestant[score.contestant_id].categories[score.category]) {
          scoresByContestant[score.contestant_id].categories[score.category] = [];
        }
        scoresByContestant[score.contestant_id].categories[score.category].push(score);
      }
    });

    const detectTies = () => {
      const categoryTotals = {};
      
      Object.entries(scoresByContestant).forEach(([contestantId, data]) => {
        Object.entries(data.categories).forEach(([category, catScores]) => {
          if (!categoryTotals[category]) categoryTotals[category] = {};
          const total = catScores.reduce((sum, s) => sum + s.total, 0);
          if (!categoryTotals[category][total]) categoryTotals[category][total] = [];
          categoryTotals[category][total].push({ contestantId, name: data.name });
        });
      });

      const ties = [];
      Object.entries(categoryTotals).forEach(([category, totals]) => {
        Object.entries(totals).forEach(([total, contestantsList]) => {
          if (contestantsList.length > 1) {
            ties.push({ category, total: parseInt(total), contestants: contestantsList });
          }
        });
      });

      return ties;
    };

    const requestTieBreak = (tie) => {
      setTieBreakRequest({
        ...tie,
        instructions: `Tie in ${tie.category}: ${tie.contestants.map(c => c.name).join(', ')} (${tie.total} pts each)`
      });
    };

    const ties = detectTies();

    if (!activePageantId) {
      return (
        <div className="p-6 max-w-6xl mx-auto">
          <div className="text-center py-12">
            <Award className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 text-lg">No active pageant selected.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">Tabulator Dashboard</h2>
            <p className="text-gray-600">Pageant: {activePageant?.name}</p>
          </div>
          <button
            onClick={() => setUser(null)}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>

        {ties.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-6 mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 mt-1" />
              <div className="flex-1">
                <h3 className="font-bold text-lg text-amber-900 mb-2">Ties Detected</h3>
                {ties.map((tie, idx) => (
                  <div key={idx} className="bg-white rounded p-3 mb-2">
                    <p className="font-medium">
                      {tie.category.toUpperCase()}: {tie.contestants.map(c => c.name).join(', ')}
                    </p>
                    <p className="text-sm text-gray-600">Each scored {tie.total} points</p>
                    <button
                      onClick={() => requestTieBreak(tie)}
                      className="mt-2 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-sm"
                    >
                      Request Tie Break
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tieBreakRequest && (
          <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-6 mb-6">
            <h3 className="font-bold text-lg mb-2">Tie Break Instructions</h3>
            <p className="mb-4">{tieBreakRequest.instructions}</p>
            <p className="text-sm text-gray-700">
              Instruct judges to review and adjust scores. Judges should inform you which score to change.
            </p>
            <button
              onClick={() => setTieBreakRequest(null)}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 bg-gray-100 border-b">
            <h3 className="font-semibold text-lg">All Scores</h3>
          </div>
          <div className="p-4 space-y-6">
            {Object.keys(scoresByContestant).length === 0 ? (
              <p className="text-gray-500 text-center py-8">No scores submitted yet</p>
            ) : (
              Object.entries(scoresByContestant).map(([contestantId, data]) => (
                <div key={contestantId} className="border rounded-lg p-4">
                  <h4 className="font-bold text-lg mb-3">{data.name}</h4>
                  {Object.entries(data.categories).map(([category, catScores]) => {
                    const totalScore = catScores.reduce((sum, s) => sum + s.total, 0);
                    const avgScore = (totalScore / catScores.length).toFixed(1);
                    
                    return (
                      <div key={category} className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="font-semibold capitalize text-purple-600">{category}</h5>
                          <div className="text-sm">
                            <span className="font-bold">Total: {totalScore}</span>
                            <span className="text-gray-500 ml-2">Avg: {avgScore}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {catScores.map((score, idx) => (
                            <div key={idx} className="bg-gray-50 p-3 rounded">
                              <div className="text-sm font-medium">{score.judge_name}</div>
                              <div className="text-2xl font-bold text-purple-600">{score.total}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                {Object.entries(score.scores).map(([k, v]) => `${k}: ${v}`).join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!user) return <LoginScreen />;
  if (user === 'Registrar') return <RegistrarDashboard />;
  if (user.startsWith('Judge')) return <JudgeDashboard />;
  if (user === 'Tabulator') return <TabulatorDashboard />;

  return null;
}

export default App;
APPEOF

echo "Building React app..."
npm run build

cd ..

echo -e "${GREEN}Frontend setup complete${NC}"
echo ""

echo -e "${YELLOW}Step 5: Creating systemd service...${NC}"

sudo tee /etc/systemd/system/pageant.service > /dev/null <<SERVICEEOF
[Unit]
Description=Pageant Scoring System
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/pageant-scoring-system
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=pageant-scoring

[Install]
WantedBy=multi-user.target
SERVICEEOF

sudo systemctl daemon-reload
sudo systemctl enable pageant.service
sudo systemctl start pageant.service

echo -e "${GREEN}Service installed and started${NC}"
echo ""

echo -e "${YELLOW}Step 6: Getting network information...${NC}"
IP_ADDRESS=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}======================================"
echo "Setup Complete!"
echo "======================================${NC}"
echo ""
echo "Your Pageant Scoring System is now running!"
echo ""
echo -e "${YELLOW}Access URLs:${NC}"
echo "  Local: http://localhost:3000"
echo "  Network: http://$IP_ADDRESS:3000"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  Check status: sudo systemctl status pageant"
echo "  Stop service: sudo systemctl stop pageant"
echo "  Start service: sudo systemctl start pageant"
echo "  View logs: sudo journalctl -u pageant -f"
echo "  Restart service: sudo systemctl restart pageant"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Connect devices to the same WiFi network as this Raspberry Pi"
echo "2. Open a browser and navigate to: http://$IP_ADDRESS:3000"
echo "3. Select your role and start using the system!"
echo ""
echo -e "${GREEN}Setup script completed successfully!${NC}"
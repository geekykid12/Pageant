import React, { useState, useEffect } from 'react';
import { Upload, Award, Mail, Plus, AlertTriangle, Search, Edit2, X } from 'lucide-react';
import * as api from './services/api';

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
  const [divisions, setDivisions] = useState([]);

  useEffect(() => {
    loadPageants();
  }, []);

  useEffect(() => {
    if (activePageantId) {
      loadContestants();
      loadScores();
      loadDivisions();
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
      console.log('Loaded contestants:', response.data);
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

  const loadDivisions = async () => {
    try {
      const response = await api.getDivisions(activePageantId);
      setDivisions(response.data);
    } catch (error) {
      console.error('Error loading divisions:', error);
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
    const [editingContestant, setEditingContestant] = useState(null);
    const [newContestant, setNewContestant] = useState({
      name: '', email: '', division: '', beauty: true, photogenic: false, costume: false
    });
    const [newPageantName, setNewPageantName] = useState('');
    const [emailStatus, setEmailStatus] = useState('');
    const [checkInNumber, setCheckInNumber] = useState('');
    const [checkInContestantId, setCheckInContestantId] = useState(null);

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

    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result.map(v => v.trim());
    };

    const parseCSV = (csvText) => {
      const lines = csvText.trim().split(/\r?\n/);
      if (lines.length < 2) {
        throw new Error('CSV must have at least a header row and one data row');
      }

      const headers = parseCSVLine(lines[0]);
      
      console.log('CSV Headers:', headers);
      
      const nameIndex = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return (lower.includes('contestant') && lower.includes('name')) ||
               (lower === 'name' && !lower.includes('parent'));
      });
      
      const emailIndex = headers.findIndex(h => h.toLowerCase().includes('email'));
      const divisionIndex = headers.findIndex(h => h.toLowerCase().includes('division'));
      const photogenicIndex = headers.findIndex(h => h.toLowerCase().includes('photogenic'));
      const costumeIndex = headers.findIndex(h => 
        h.toLowerCase().includes('costume') || 
        h.toLowerCase().includes('casual wear')
      );
      
      console.log('Column indices:', { 
        nameIndex, 
        emailIndex, 
        divisionIndex, 
        photogenicIndex, 
        costumeIndex,
        divisionHeader: divisionIndex >= 0 ? headers[divisionIndex] : 'NOT FOUND'
      });

      if (nameIndex === -1 || emailIndex === -1) {
        alert('CSV must contain "Name" and "Email" columns. Found columns: ' + headers.join(', '));
        throw new Error('Required columns not found');
      }
      
      const contestants = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        
        const rawData = {};
        headers.forEach((header, idx) => {
          rawData[header] = values[idx] || '';
        });
        
        const name = values[nameIndex]?.trim();
        const email = values[emailIndex]?.trim();
        const division = divisionIndex >= 0 ? (values[divisionIndex]?.trim() || '') : '';
        
        if (!name || !email) {
          console.warn(`Skipping row ${i + 1}: missing name or email`);
          continue;
        }
        
        console.log(`Row ${i}: name=${name}, division=${division}`);
        
        contestants.push({
          pageant_id: activePageantId,
          name: name,
          email: email,
          division: division,
          beauty: true,
          photogenic: photogenicIndex >= 0 ? (values[photogenicIndex]?.toLowerCase().includes('yes') || false) : false,
          costume: costumeIndex >= 0 ? (values[costumeIndex]?.toLowerCase().includes('yes') || false) : false,
          raw_data: rawData
        });
      }
      
      console.log('Parsed contestants with divisions:', contestants.map(c => ({ name: c.name, division: c.division })));
      return contestants;
    };

    const handleCSVImport = async () => {
      if (!activePageantId) {
        alert('Please create or select an active pageant first');
        return;
      }

      try {
        setLoading(true);
        const newContestants = parseCSV(csvData);
        
        if (newContestants.length === 0) {
          alert('No valid contestants found in CSV');
          setLoading(false);
          return;
        }

        console.log('Importing contestants:', newContestants);
        await api.bulkCreateContestants(newContestants);
        setCsvData('');
        setShowImport(false);
        await loadContestants();
        await loadDivisions();
        alert(`Successfully imported ${newContestants.length} contestants!`);
      } catch (error) {
        alert('Error importing CSV: ' + error.message);
        console.error('CSV Import Error:', error);
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
        setNewContestant({ name: '', email: '', division: '', beauty: true, photogenic: false, costume: false });
        setShowAddContestant(false);
        await loadContestants();
        await loadDivisions();
      } catch (error) {
        console.error('Error adding contestant:', error);
        alert('Error adding contestant');
      }
    };

    const updateContestant = async () => {
      if (!editingContestant) return;

      try {
        await api.updateContestant(editingContestant.id, editingContestant);
        setEditingContestant(null);
        await loadContestants();
        await loadDivisions();
      } catch (error) {
        console.error('Error updating contestant:', error);
        alert('Error updating contestant');
      }
    };

    const toggleCheckIn = async (id, currentStatus) => {
      if (!currentStatus) {
        setCheckInContestantId(id);
        setCheckInNumber('');
      } else {
        try {
          await api.updateCheckIn(id, false, null);
          await loadContestants();
        } catch (error) {
          console.error('Error updating check-in:', error);
        }
      }
    };

    const confirmCheckIn = async () => {
      if (!checkInNumber.trim()) {
        alert('Please enter a contestant number');
        return;
      }

      try {
        await api.updateCheckIn(checkInContestantId, true, checkInNumber);
        setCheckInContestantId(null);
        setCheckInNumber('');
        await loadContestants();
      } catch (error) {
        console.error('Error checking in:', error);
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
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.division && c.division.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.contestant_number && c.contestant_number.includes(searchTerm))
    );

    const unpaidTotal = activeContestants.reduce((sum, c) => sum + (c.paid ? 0 : c.balance), 0);
    const checkedInCount = activeContestants.filter(c => c.checked_in).length;

    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800">Registrar Dashboard</h2>
          <button onClick={() => setUser(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
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
            <button onClick={createPageant} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">
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
                <div className="text-2xl font-bold text-purple-800">{checkedInCount}/{activeContestants.length}</div>
                <div className="text-xs text-purple-600">Checked In</div>
              </div>
              <div className="bg-green-100 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-800">${unpaidTotal.toFixed(2)}</div>
                <div className="text-xs text-green-600">Outstanding</div>
              </div>
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
                  Paste CSV with Name, Email, Division, Photogenic, Costume columns
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
                <div className="grid grid-cols-3 gap-4 mb-4">
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
                  <input
                    type="text"
                    placeholder="Division"
                    value={newContestant.division}
                    onChange={(e) => setNewContestant({ ...newContestant, division: e.target.value })}
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

            {editingContestant && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl">Edit Contestant</h3>
                    <button onClick={() => setEditingContestant(null)} className="text-gray-500 hover:text-gray-700">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block mb-1 font-medium">Name</label>
                      <input
                        type="text"
                        value={editingContestant.name}
                        onChange={(e) => setEditingContestant({ ...editingContestant, name: e.target.value })}
                        className="w-full border rounded p-2"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-medium">Email</label>
                      <input
                        type="email"
                        value={editingContestant.email}
                        onChange={(e) => setEditingContestant({ ...editingContestant, email: e.target.value })}
                        className="w-full border rounded p-2"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-medium">Division</label>
                      <input
                        type="text"
                        value={editingContestant.division || ''}
                        onChange={(e) => setEditingContestant({ ...editingContestant, division: e.target.value })}
                        className="w-full border rounded p-2"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-medium">Contestant Number</label>
                      <input
                        type="text"
                        value={editingContestant.contestant_number || ''}
                        onChange={(e) => setEditingContestant({ ...editingContestant, contestant_number: e.target.value })}
                        className="w-full border rounded p-2"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 mb-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingContestant.photogenic === 1}
                        onChange={(e) => setEditingContestant({ ...editingContestant, photogenic: e.target.checked ? 1 : 0 })}
                        className="mr-2"
                      />
                      Photogenic
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingContestant.costume === 1}
                        onChange={(e) => setEditingContestant({ ...editingContestant, costume: e.target.checked ? 1 : 0 })}
                        className="mr-2"
                      />
                      Costume
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={updateContestant} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">
                      Save Changes
                    </button>
                    <button onClick={() => setEditingContestant(null)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {checkInContestantId && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full">
                  <h3 className="font-bold text-xl mb-4">Assign Contestant Number</h3>
                  <input
                    type="text"
                    value={checkInNumber}
                    onChange={(e) => setCheckInNumber(e.target.value)}
                    placeholder="Enter contestant number"
                    className="w-full border rounded p-2 mb-4"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={confirmCheckIn} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">
                      Check In
                    </button>
                    <button
                      onClick={() => {
                        setCheckInContestantId(null);
                        setCheckInNumber('');
                      }}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow mb-6">
              <div className="bg-gray-100 px-4 py-3 border-b flex justify-between items-center">
                <h3 className="font-semibold text-lg">{activePageant.name} - Contestants</h3>
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
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">Number</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Division</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Categories</th>
                      <th className="px-4 py-3 text-center">Payment</th>
                      <th className="px-4 py-3 text-center">Balance</th>
                      <th className="px-4 py-3 text-center">Check-In</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContestants.map(c => {
                      const categories = [
                        'Beauty',
                        c.photogenic === 1 && 'Photogenic',
                        c.costume === 1 && 'Costume'
                      ].filter(Boolean).join(', ');

                      return (
                        <tr key={c.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3 font-bold text-purple-600">{c.contestant_number || '-'}</td>
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{c.division || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{c.email}</td>
                          <td className="px-4 py-3 text-sm">{categories}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => updatePaymentField(c.id, 'paid', c.paid === 1 ? 0 : 1)}
                              className={`px-3 py-1 rounded text-sm font-medium ${
                                c.paid === 1 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
    className="w-20 border rounded px-2 py-1 text-center text-sm"
    step="0.01"
    disabled={c.paid === 1}
  />
</td>
<td className="px-4 py-3 text-center">
  <button
    onClick={() => toggleCheckIn(c.id, c.checked_in)}
    className={`px-4 py-2 rounded font-medium text-sm ${
      c.checked_in === 1
        ? 'bg-green-100 text-green-800 hover:bg-green-200'
        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
    }`}
  >
    {c.checked_in === 1 ? 'Checked In' : 'Check In'}
  </button>
</td>
<td className="px-4 py-3 text-center">
  <button
    onClick={() => setEditingContestant(c)}
    className="text-purple-600 hover:text-purple-800"
  >
    <Edit2 className="w-5 h-5" />
  </button>
</td>
</tr>
);
})}
</tbody>
</table>
</div>
</div>
</>
)}
</div>
);
};const JudgeDashboard = () => {
const [currentScores, setCurrentScores] = useState({});
const [comments, setComments] = useState('');
const [selectedDivision, setSelectedDivision] = useState('');
const criteria = {
  beauty: ['Poise', 'Confidence', 'Stage Presence', 'Overall Impression'],
  photogenic: ['Photo Quality', 'Expression', 'Composition'],
  costume: ['Creativity', 'Fit', 'Theme Adherence', 'Overall Effect']
};

const divisionContestants = selectedDivision 
  ? getCheckedInContestants().filter(c => c.division === selectedDivision && c[category] === 1)
  : [];

const activePageant = getActivePageant();

const handleScoreChange = (criterion, value) => {
  const numValue = parseFloat(value);
  if (!isNaN(numValue) && numValue >= 0 && numValue <= 25) {
    setCurrentScores(prev => ({
      ...prev,
      [criterion]: numValue
    }));
  }
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
      total,
      comments: comments.trim() || null
    });
    
    setCurrentScores({});
    setComments('');
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
      <button onClick={() => setUser(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
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
              setComments('');
            }}
            className={`px-4 py-2 rounded capitalize ${category === cat ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <label className="block mb-2 font-semibold">Select Division:</label>
      <select
        value={selectedDivision}
        onChange={(e) => {
          setSelectedDivision(e.target.value);
          setSelectedContestant(null);
          setCurrentScores({});
          setComments('');
        }}
        className="w-full border rounded p-2 mb-4"
      >
        <option value="">-- Select Division --</option>
        {divisions.map(div => (
          <option key={div} value={div}>{div}</option>
        ))}
      </select>

      {selectedDivision && (
        <>
          <label className="block mb-2 font-semibold">Select Contestant Number:</label>
          <select
            value={selectedContestant?.id || ''}
            onChange={(e) => {
              const contestant = divisionContestants.find(c => c.id === parseInt(e.target.value));
              setSelectedContestant(contestant);
              setCurrentScores({});
              setComments('');
            }}
            className="w-full border rounded p-2 mb-4"
          >
            <option value="">-- Select Contestant --</option>
            {divisionContestants.map(c => (
              <option key={c.id} value={c.id}>
                #{c.contestant_number} - {c.name}
              </option>
            ))}
          </select>
        </>
      )}

      {divisionContestants.length === 0 && selectedDivision && (
        <p className="text-amber-600 bg-amber-50 p-3 rounded mb-4">
          No checked-in contestants for this division and category.
        </p>
      )}

      {selectedContestant && (
        <div className="space-y-4">
          <div className="bg-purple-50 p-4 rounded">
            <h3 className="text-xl font-semibold mb-4">
              Score #{selectedContestant.contestant_number} - {selectedContestant.name} - {category}
            </h3>
            {criteria[category].map(criterion => (
              <div key={criterion} className="mb-4">
                <label className="block mb-1 font-medium">{criterion} (0-25)</label>
                <input
                  type="number"
                  min="0"
                  max="25"
                  step="0.5"
                  value={currentScores[criterion] !== undefined ? currentScores[criterion] : ''}
                  onChange={(e) => handleScoreChange(criterion, e.target.value)}
                  className="w-full border rounded p-2"
                />
              </div>
            ))}
            <div className="mb-4">
              <label className="block mb-1 font-medium">Comments (Optional)</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full border rounded p-2"
                rows="3"
                placeholder="Add any comments here..."
              />
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="text-lg font-bold">
                Total: {Object.values(currentScores).reduce((a, b) => a + b, 0).toFixed(1)} / {criteria[category].length * 25}
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
        number: contestant.contestant_number,
        division: contestant.division,
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
      categoryTotals[category][total].push({ contestantId, name: data.name, number: data.number });
    });
  });

  const ties = [];
  Object.entries(categoryTotals).forEach(([category, totals]) => {
    Object.entries(totals).forEach(([total, contestantsList]) => {
      if (contestantsList.length > 1) {
        ties.push({ category, total: parseFloat(total), contestants: contestantsList });
      }
    });
  });

  return ties;
};

const requestTieBreak = (tie) => {
  setTieBreakRequest({
    ...tie,
    instructions: `Tie in ${tie.category}: ${tie.contestants.map(c => `#${c.number} ${c.name}`).join(', ')} (${tie.total} pts each)`
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
      <button onClick={() => setUser(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
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
                  {tie.category.toUpperCase()}: {tie.contestants.map(c => `#${c.number} ${c.name}`).join(', ')}
                </p>
                <p className="text-sm text-gray-600">Each scored {tie.total.toFixed(1)} points</p>
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
              <h4 className="font-bold text-lg mb-1">
                #{data.number} - {data.name}
              </h4>
              <p className="text-sm text-gray-600 mb-3">Division: {data.division}</p>
              {Object.entries(data.categories).map(([category, catScores]) => {
                const totalScore = catScores.reduce((sum, s) => sum + s.total, 0);
                const avgScore = (totalScore / catScores.length).toFixed(1);
                
                return (
                  <div key={category} className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="font-semibold capitalize text-purple-600">{category}</h5>
                      <div className="text-sm">
                        <span className="font-bold">Total: {totalScore.toFixed(1)}</span>
                        <span className="text-gray-500 ml-2">Avg: {avgScore}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {catScores.map((score, idx) => (
                        <div key={idx} className="bg-gray-50 p-3 rounded">
                          <div className="text-sm font-medium">{score.judge_name}</div>
                          <div className="text-2xl font-bold text-purple-600">{score.total.toFixed(1)}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {Object.entries(score.scores).map(([k, v]) => `${k}: ${v}`).join(', ')}
                          </div>
                          {score.comments && (
                            <div className="text-xs text-gray-600 mt-2 italic border-t pt-2">
                              "{score.comments}"
                            </div>
                          )}
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
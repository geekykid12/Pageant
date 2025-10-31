import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Award, Mail, Plus, AlertTriangle, Search, Edit2, X, CheckSquare, Lock, Calendar, Users, UserCheck } from 'lucide-react';
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

  const activePageant = useMemo(() => {
    return pageants.find(p => p.id === activePageantId) || null;
  }, [pageants, activePageantId]);

  const judgeNames = useMemo(() => {
    if (activePageant && activePageant.judges && activePageant.judges.length > 0) {
      return activePageant.judges;
    }
    return ['Judge 1', 'Judge 2', 'Judge 3']; // Fallback
  }, [activePageant]);

  useEffect(() => {
    loadPageants();
  }, []);

  useEffect(() => {
    if (activePageantId) {
      loadContestants();
      loadAllScores(); 
      loadDivisions();
    } else {
      setContestants([]);
      setScores([]);
      setDivisions([]);
    }
  }, [activePageantId]);

  const loadPageants = async () => {
    try {
      const response = await api.getPageants();
      setPageants(response.data);
      const active = response.data.find(p => p.active);
      if (active) {
        setActivePageantId(active.id);
      } else if (response.data.length > 0) {
        setActivePageantId(response.data[0]?.id || null);
      }
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

  const loadAllScores = async () => {
    try {
      const response = await api.getScores(activePageantId);
      setScores(response.data);
    } catch (error) {
      console.error('Error loading scores:', error);
    }
  };

  const loadDivisions = async () => {
    try {
      // This now correctly reads from the pageant data, not from contestants
      if (activePageant) {
        setDivisions(activePageant.divisions || []);
      } else {
        // Fallback if activePageant isn't set yet
        const pageant = pageants.find(p => p.id === activePageantId);
        if (pageant) {
          setDivisions(pageant.divisions || []);
        } else {
           // Final fallback, hit API (though this is less efficient)
           const response = await api.getDivisions(activePageantId);
           setDivisions(response.data);
        }
      }
    } catch (error) {
      console.error('Error loading divisions:', error);
    }
  };
  
  // Re-load divisions if activePageant changes
  useEffect(() => {
    if (activePageant) {
        setDivisions(activePageant.divisions || []);
    }
  }, [activePageant]);


  // const getActivePageant = () => pageants.find(p => p.id === activePageantId); // Replaced with useMemo
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
          {['Registrar', ...judgeNames, 'Tabulator'].map(role => (
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

  // ==========================================================
  // ## RegistrarDashboard
  // ==========================================================
  const RegistrarDashboard = () => {
    const [csvData, setCsvData] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [showAddContestant, setShowAddContestant] = useState(false);
    const [editingContestant, setEditingContestant] = useState(null);
    const [editingPageant, setEditingPageant] = useState(null); 
    
    const [newContestant, setNewContestant] = useState({
      name: '', email: '', phone: '', division: '', beauty: true, photogenic: false, casual_wear: false
    });
    
    // New Pageant State
    const [newPageantName, setNewPageantName] = useState('');
    const [newPageantDate, setNewPageantDate] = useState('');
    const [newPageantDivisions, setNewPageantDivisions] = useState('');
    const [newPageantJudges, setNewPageantJudges] = useState('');
    const [enableCasualWear, setEnableCasualWear] = useState(false);

    const [checkInNumber, setCheckInNumber] = useState('');
    const [checkInContestantId, setCheckInContestantId] = useState(null);
    
    const [sortConfig, setSortConfig] = useState({ key: 'contestant_number', direction: 'ascending' });
    const [divisionFilter, setDivisionFilter] = useState('');

    // Send Scores State
    const [sendScoresDivision, setSendScoresDivision] = useState('');
    const [sendScoresStatus, setSendScoresStatus] = useState('');
    
    const requestSort = (key) => {
      let direction = 'ascending';
      if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
      }
      setSortConfig({ key, direction });
    };

    const getSortIndicator = (key) => {
      if (sortConfig.key !== key) return null;
      return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };

    const createPageant = async () => {
      if (!newPageantName.trim()) return;
      
      const divisionsArray = newPageantDivisions.split(',').map(d => d.trim()).filter(Boolean);
      const judgesArray = newPageantJudges.split(',').map(j => j.trim()).filter(Boolean);

      try {
        const response = await api.createPageant({
          name: newPageantName,
          enable_casual_wear: enableCasualWear,
          date: newPageantDate,
          divisions: divisionsArray,
          judges: judgesArray.length > 0 ? judgesArray : ['Judge 1', 'Judge 2', 'Judge 3'] // Default
        });
        setNewPageantName('');
        setNewPageantDate('');
        setNewPageantDivisions('');
        setNewPageantJudges('');
        setEnableCasualWear(false); 
        await loadPageants();
        await api.setActivePageant(response.data.id);
        setActivePageantId(response.data.id);
      } catch (error) {
        console.error('Error creating pageant:', error);
        alert('Error creating pageant');
      }
    };

    const handleUpdatePageant = async (pageantData) => {
      try {
        await api.updatePageant(pageantData.id, pageantData);
        setEditingPageant(null);
        await loadPageants(); // This will refresh the activePageant and all its data
        alert('Pageant updated successfully!');
      } catch (error) {
        console.error('Error updating pageant:', error);
        alert('Error updating pageant');
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
      
      const nameIndex = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return (lower.includes('contestant') && lower.includes('name')) ||
               (lower === 'name' && !lower.includes('parent'));
      });
      
      const emailIndex = headers.findIndex(h => h.toLowerCase().includes('email'));
      const phoneIndex = headers.findIndex(h => h.toLowerCase().includes('phone')); 
      const divisionIndex = headers.findIndex(h => h.toLowerCase().includes('division'));
      const photogenicIndex = headers.findIndex(h => h.toLowerCase().includes('photogenic'));
      
      const casualWearIndex = headers.findIndex(h => 
        h.toLowerCase().includes('costume') || 
        h.toLowerCase().includes('casual wear')
      );
      
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
        const phone = phoneIndex >= 0 ? (values[phoneIndex]?.trim() || '') : ''; 
        const division = divisionIndex >= 0 ? (values[divisionIndex]?.trim() || '') : '';
        
        if (!name || !email) continue;
        
        contestants.push({
          pageant_id: activePageantId,
          name: name,
          email: email,
          phone: phone, 
          division: division,
          beauty: true,
          photogenic: photogenicIndex >= 0 ? (values[photogenicIndex]?.toLowerCase().includes('yes') || false) : false,
          casual_wear: casualWearIndex >= 0 ? (values[casualWearIndex]?.toLowerCase().includes('yes') || false) : false,
          raw_data: rawData
        });
      }
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
        await api.bulkCreateContestants({contestants: newContestants}); 
        setCsvData('');
        setShowImport(false);
        await loadContestants();
        alert(`Successfully imported ${newContestants.length} contestants!`);
      } catch (error) {
        alert('Error importing CSV: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    const addManualContestant = async () => {
      if (!activePageantId) {
        alert('Please create or select an active pageant first');
        return;
      }
      if (!newContestant.name || !newContestant.email || !newContestant.division) {
        alert('Name, Email, and Division are required');
        return;
      }
      try {
        await api.createContestant({
          ...newContestant,
          pageant_id: activePageantId
        });
        setNewContestant({ name: '', email: '', phone: '', division: '', beauty: true, photogenic: false, casual_wear: false });
        setShowAddContestant(false);
        await loadContestants();
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
      } catch (error) {
        console.error('Error updating contestant:', error);
        alert('Error updating contestant');
      }
    };

    // ==========================================================
    // ## MODIFIED: toggleCheckIn
    // ==========================================================
    const toggleCheckIn = async (id, currentStatus) => {
      if (!currentStatus) {
        // Find the contestant to get their division
        const contestant = contestants.find(c => c.id === id);
        if (!contestant || !contestant.division) {
            alert('This contestant does not have a division assigned. Please edit them first.');
            return;
        }

        // Find the max number in that division
        let maxNumber = 0;
        contestants
          .filter(c => c.division === contestant.division && c.contestant_number)
          .forEach(c => {
            const num = parseInt(c.contestant_number, 10);
            if (!isNaN(num) && num > maxNumber) {
              maxNumber = num;
            }
          });
        
        // Set the default number to max + 1
        setCheckInNumber((maxNumber + 1).toString());
        setCheckInContestantId(id);

      } else {
        // Standard check-out logic
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

    const setActivePageantHandler = async (id) => {
      try {
        await api.setActivePageant(id);
        setActivePageantId(id);
        await loadPageants(); // This will re-fetch all pageant data
      } catch (error) {
        console.error('Error setting active pageant:', error);
      }
    };
    
    const handleSendScores = async () => {
      if (!sendScoresDivision) {
        alert("Please select a validated division to send scores.");
        return;
      }
      
      setSendScoresStatus('Sending score sheets... This may take a moment.');
      setLoading(true);
      
      try {
        const response = await api.sendScoreSheets(activePageantId, sendScoresDivision);
        setSendScoresStatus(`Successfully sent ${response.data.sent} score sheets for ${sendScoresDivision}!`);
        setSendScoresDivision('');
      } catch (error) {
        console.error('Error sending score sheets:', error);
        setSendScoresStatus('An error occurred. Please check server logs.');
      } finally {
        setLoading(false);
        setTimeout(() => setSendScoresStatus(''), 5000); 
      }
    };

    const activeContestants = getActiveContestants();
    
    const processedContestants = useMemo(() => {
      let filterableContestants = contestants.filter(c => c.pageant_id === activePageantId);
      if (searchTerm) {
        filterableContestants = filterableContestants.filter(c =>
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.phone && c.phone.includes(searchTerm)) || 
          (c.division && c.division.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (c.contestant_number && c.contestant_number.includes(searchTerm))
        );
      }
      if (divisionFilter) {
        filterableContestants = filterableContestants.filter(c => c.division === divisionFilter);
      }
      if (sortConfig.key) {
        filterableContestants = [...filterableContestants].sort((a, b) => {
          let aValue = a[sortConfig.key];
          let bValue = b[sortConfig.key];
          switch (sortConfig.key) {
            case 'contestant_number':
              // Handle non-numeric and null/undefined values
              const aNum = aValue ? parseInt(aValue.toString().replace(/\D/g, ''), 10) : Infinity;
              const bNum = bValue ? parseInt(bValue.toString().replace(/\D/g, ''), 10) : Infinity;
              
              if (isNaN(aNum) && isNaN(bNum)) return 0;
              if (isNaN(aNum)) return 1; // Put non-numeric at the end
              if (isNaN(bNum)) return -1;
              
              if (aNum < bNum) return sortConfig.direction === 'ascending' ? -1 : 1;
              if (aNum > bNum) return sortConfig.direction === 'ascending' ? 1 : -1;
              
              // Secondary sort by non-numeric part if numbers are equal (e.g., "10A" vs "10B")
              const aStr = aValue ? aValue.toString() : '';
              const bStr = bValue ? bValue.toString() : '';
              if (aStr < bStr) return sortConfig.direction === 'ascending' ? -1 : 1;
              if (aStr > bStr) return sortConfig.direction === 'ascending' ? 1 : -1;
              
              return 0;
            case 'paid':
            case 'checked_in':
            case 'photogenic': 
            case 'casual_wear': 
              const aBool = aValue === 1 ? 1 : 0;
              const bBool = bValue === 1 ? 1 : 0;
              if (aBool < bBool) return sortConfig.direction === 'ascending' ? -1 : 1;
              if (aBool > bBool) return sortConfig.direction === 'ascending' ? 1 : -1;
              return 0;
            case 'balance':
              const aBal = aValue || 0;
              const bBal = bValue || 0;
              if (aBal < bBal) return sortConfig.direction === 'ascending' ? -1 : 1;
              if (aBal > bBal) return sortConfig.direction === 'ascending' ? 1 : -1;
              return 0;
            case 'name':
            case 'division':
            case 'email':
            case 'phone': 
            default:
              aValue = (aValue || '').toLowerCase();
              bValue = (bValue || '').toLowerCase();
              if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
              if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
              return 0;
          }
        });
      }
      return filterableContestants;
    }, [contestants, activePageantId, searchTerm, divisionFilter, sortConfig]);
    
    const unpaidTotal = activeContestants.reduce((sum, c) => sum + (c.paid ? 0 : c.balance), 0);
    const checkedInCount = activeContestants.filter(c => c.checked_in).length;

    const validatedDivisions = activePageant?.validated_divisions || [];

    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800">Registrar Dashboard</h2>
          <button onClick={() => setUser(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
            Logout
          </button>
        </div>

        {editingPageant && (
          <EditPageantModal
            pageant={editingPageant}
            onClose={() => setEditingPageant(null)}
            onSave={handleUpdatePageant}
          />
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold text-xl mb-4">Pageant Management</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              value={newPageantName}
              onChange={(e) => setNewPageantName(e.target.value)}
              placeholder="New Pageant Name"
              className="border rounded p-2"
            />
            <input
              type="date"
              value={newPageantDate}
              onChange={(e) => setNewPageantDate(e.target.value)}
              placeholder="Pageant Date"
              className="border rounded p-2"
            />
            <input
              type="text"
              value={newPageantDivisions}
              onChange={(e) => setNewPageantDivisions(e.target.value)}
              placeholder="Divisions (comma-separated)"
              className="border rounded p-2"
            />
            <input
              type="text"
              value={newPageantJudges}
              onChange={(e) => setNewPageantJudges(e.target.value)}
              placeholder="Judges (comma-separated, default 3)"
              className="border rounded p-2"
            />
          </div>
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="enableCasualWear"
              checked={enableCasualWear}
              onChange={(e) => setEnableCasualWear(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="enableCasualWear">Enable Casual Wear</label>
          </div>
          <button onClick={createPageant} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">
            Create Pageant
          </button>
          
          <hr className="my-6" />

          <div className="space-y-2">
            {pageants.map(p => (
              <div
                key={p.id}
                className={`flex justify-between items-center p-3 rounded ${
                  p.id === activePageantId ? 'bg-purple-100 border-2 border-purple-600' : 'bg-gray-50'
                }`}
              >
                <div className="flex-1 cursor-pointer" onClick={() => setActivePageantHandler(p.id)}>
                  <span className="font-semibold">{p.name}</span>
                  {p.date && <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">{p.date}</span>}
                  {p.enable_casual_wear === 1 && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Casual Wear</span>}
                  {p.completed === 1 && <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Completed</span>}
                </div>
                <div className="flex items-center">
                  {p.id === activePageantId && <span className="text-purple-600 font-bold mr-4">ACTIVE</span>}
                  <button
                    onClick={() => setEditingPageant(p)}
                    className="text-purple-600 hover:text-purple-800"
                    title="Edit Pageant"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {activePageant && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="font-bold text-xl mb-4">Send Score Sheets</h3>
              <p className="text-sm text-gray-600 mb-1">Select a division that has been validated by the Tabulator.</p>
              <div className="flex gap-4 mb-4">
                <select
                  value={sendScoresDivision}
                  onChange={(e) => setSendScoresDivision(e.target.value)}
                  className="flex-1 border rounded p-2"
                >
                  <option value="">-- Select Validated Division --</option>
                  {divisions.map(div => (
                    <option key={div} value={div} disabled={!validatedDivisions.includes(div)}>
                      {div} {validatedDivisions.includes(div) ? ' (Validated)' : ' (Not Validated)'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSendScores}
                  disabled={!sendScoresDivision || loading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded flex items-center"
                >
                  <Mail className="w-5 h-5 mr-2" />
                  Send Scores
                </button>
              </div>
              {sendScoresStatus && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-blue-800 font-medium">{sendScoresStatus}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <button
                onClick={() => setShowImport(!showImport)}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white p-4 rounded-lg flex items-center justify-center space-x-2"
              >
                <Upload className="w-5 h-5" />
                <span>Import CSV</span>
              </button>
              <button
                onClick={() => setShowAddContestant(!showAddContestant)}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white p-4 rounded-lg flex items-center justify-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Add Contestant</span>
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
            
            {showImport && (
              <div className="bg-white border-2 border-blue-300 rounded-lg p-4 mb-6">
                <h3 className="font-semibold mb-2">Import Contestants (CSV Format)</h3>
                <p className="text-sm text-gray-600 mb-2">
                  CSV must include Name and Email. Optional: Phone, Division, Photogenic, Casual Wear.
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <input
                    type="text"
                    placeholder="Name*"
                    value={newContestant.name}
                    onChange={(e) => setNewContestant({ ...newContestant, name: e.target.value })}
                    className="border rounded p-2"
                  />
                  <input
                    type="email"
                    placeholder="Email*"
                    value={newContestant.email}
                    onChange={(e) => setNewContestant({ ...newContestant, email: e.target.value })}
                    className="border rounded p-2"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={newContestant.phone}
                    onChange={(e) => setNewContestant({ ...newContestant, phone: e.target.value })}
                    className="border rounded p-2"
                  />
                </div>
                <div className="mb-4">
                  <label className="block mb-1 font-medium">Division*</label>
                  <select
                    value={newContestant.division}
                    onChange={(e) => setNewContestant({ ...newContestant, division: e.target.value })}
                    className="w-full border rounded p-2"
                  >
                    <option value="">-- Select Division --</option>
                    {divisions.map(div => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
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
                  {activePageant?.enable_casual_wear === 1 && (
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newContestant.casual_wear}
                        onChange={(e) => setNewContestant({ ...newContestant, casual_wear: e.target.checked })}
                        className="mr-2"
                      />
                      Casual Wear
                    </label>
                  )}
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
                <div className="bg-white rounded-lg p-6 max-w-2xl w-full overflow-y-auto max-h-screen">
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
                      <label className="block mb-1 font-medium">Phone</label>
                      <input
                        type="tel"
                        value={editingContestant.phone || ''}
                        onChange={(e) => setEditingContestant({ ...editingContestant, phone: e.target.value })}
                        className="w-full border rounded p-2"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-medium">Division</label>
                       <select
                        value={editingContestant.division || ''}
                        onChange={(e) => setEditingContestant({ ...editingContestant, division: e.target.value })}
                        className="w-full border rounded p-2"
                      >
                        <option value="">-- Select Division --</option>
                        {divisions.map(div => (
                          <option key={div} value={div}>{div}</option>
                        ))}
                      </select>
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
                    {activePageant?.enable_casual_wear === 1 && (
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={editingContestant.casual_wear === 1}
                          onChange={(e) => setEditingContestant({ ...editingContestant, casual_wear: e.target.checked ? 1 : 0 })}
                          className="mr-2"
                        />
                        Casual Wear
                      </label>
                    )}
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
                  <select
                    value={divisionFilter}
                    onChange={(e) => setDivisionFilter(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="">All Divisions</option>
                    {divisions.map(div => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left cursor-pointer" onClick={() => requestSort('contestant_number')}>
                        Number{getSortIndicator('contestant_number')}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer" onClick={() => requestSort('name')}>
                        Name{getSortIndicator('name')}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer" onClick={() => requestSort('division')}>
                        Division{getSortIndicator('division')}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer" onClick={() => requestSort('email')}>
                        Email{getSortIndicator('email')}
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer" onClick={() => requestSort('phone')}>
                        Phone{getSortIndicator('phone')}
                      </th>
                      <th className="px-4 py-3 text-left">Categories</th>
                      <th className="px-4 py-3 text-center cursor-pointer" onClick={() => requestSort('paid')}>
                        Payment{getSortIndicator('paid')}
                      </th>
                      <th className="px-4 py-3 text-center cursor-pointer" onClick={() => requestSort('balance')}>
                        Balance{getSortIndicator('balance')}
                      </th>
                      <th className="px-4 py-3 text-center cursor-pointer" onClick={() => requestSort('checked_in')}>
                        Check-In{getSortIndicator('checked_in')}
                      </th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedContestants.map(c => {
                      const categories = [
                        c.photogenic === 1 && 'Photogenic',
                        c.casual_wear === 1 && 'Casual Wear'
                      ].filter(Boolean).join(', ') || 'Main';

                      return (
                        <tr key={c.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3 font-bold text-purple-600">{c.contestant_number || '-'}</td>
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{c.division || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{c.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{c.phone || '-'}</td>
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
  };

  // ==========================================================
  // ## EditPageantModal (NEW COMPONENT from last step)
  // ==========================================================
  const EditPageantModal = ({ pageant, onClose, onSave }) => {
    const [name, setName] = useState(pageant.name);
    const [date, setDate] = useState(pageant.date || '');
    const [divisions, setDivisions] = useState(pageant.divisions.join(', '));
    const [judges, setJudges] = useState(pageant.judges.join(', '));
    const [enableCasualWear, setEnableCasualWear] = useState(pageant.enable_casual_wear === 1);

    const handleSubmit = () => {
      const divisionsArray = divisions.split(',').map(d => d.trim()).filter(Boolean);
      const judgesArray = judges.split(',').map(j => j.trim()).filter(Boolean);

      onSave({
        id: pageant.id,
        name,
        date,
        divisions: divisionsArray,
        judges: judgesArray.length > 0 ? judgesArray : ['Judge 1', 'Judge 2', 'Judge 3'],
        enable_casual_wear: enableCasualWear
      });
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-xl">Edit Pageant: {pageant.name}</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 font-medium">Pageant Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Pageant Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Divisions (comma-separated)</label>
              <input
                type="text"
                value={divisions}
                onChange={(e) => setDivisions(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Judges (comma-separated)</label>
              <input
                type="text"
                value={judges}
                onChange={(e) => setJudges(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={enableCasualWear}
                onChange={(e) => setEnableCasualWear(e.target.checked)}
                className="mr-2"
              />
              Enable Casual Wear
            </label>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={handleSubmit} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">
              Save Changes
            </button>
            <button onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };


  // ==========================================================
  // ## JudgeDashboard
  // ==========================================================
  const JudgeDashboard = ({ onScoreSubmitted, activePageant }) => { // MODIFIED: Added activePageant prop
    const [currentScores, setCurrentScores] = useState({});
    const [comments, setComments] = useState('');
    const [selectedDivision, setSelectedDivision] = useState('');
    
    const [myScores, setMyScores] = useState([]);
    const [submittedScore, setSubmittedScore] = useState(null);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const criteria = {
      beauty: [
        'Natural Beauty', 
        'Personality', 
        'Attire', 
        'Stage Presence'
      ],
      photogenic: [
        'Photo Score'
      ],
      casual_wear: [
        'Creativity', 
        'Fit', 
        'Theme Adherence', 
        'Overall Effect'
      ]
    };

    const criteriaInfo = {
      'Natural Beauty': [
        'Makeup is flattering and age appropriate',
        'hairstyle is flattering and age appropriate',
        'Facial Beauty'
      ],
      'Personality': [
        'The contestant enjoys being on stage.',
        'Overall impression of the contestant',
        'does he/she possess the presence of a King/Queen?'
      ],
      'Attire': [
        'Attire is an appropriate style for the age division',
        'Attire is becoming on the contestant (look at fit, style, color, etc.)',
        'Attire fits the contestant well',
        'Overall appearance complements the contestant.'
      ],
      'Stage Presence': [
        'Poise and confidence while on stage.',
        'Modeling (appropriate for age)',
        'Display of true personality',
        'Eye contact with judges and audience.'
      ],
      'Photo Score': [],
      'Creativity': [],
      'Fit': [],
      'Theme Adherence': [],
      'Overall Effect': []
    };
    
    useEffect(() => {
        if (activePageantId && user) {
            const loadMyScores = async () => {
                try {
                    const response = await api.getScoresByJudge(activePageantId, user);
                    let scoresArray = [];
                    if (Array.isArray(response.data)) {
                        scoresArray = response.data;
                    } else if (response.data?.scores && Array.isArray(response.data.scores)) {
                        scoresArray = response.data.scores;
                    } else {
                        console.warn("Unexpected scores response:", response.data);
                    }
                    setMyScores(scoresArray);
                } catch (error) {
                    console.error("Error loading judge's scores:", error);
                    setMyScores([]);
                }
                };
            loadMyScores();
        }
    }, [activePageantId, user]);


    // ==========================================================
    // ## MODIFIED: useEffect for score locking
    // ==========================================================
    useEffect(() => {
        if (selectedContestant && category) {
            // Check if division is validated
            const isDivisionValidated = activePageant?.validated_divisions?.includes(selectedContestant.division);

            const foundScore = myScores.find(
            s => s.contestant_id === selectedContestant.id && s.category === category
            );

            if (foundScore) {
              setIsSubmitted(true); // Lock if score is found
              setSubmittedScore(foundScore);
              let parsedScores = {};
              try {
                  parsedScores =
                  typeof foundScore.scores === 'string'
                      ? JSON.parse(foundScore.scores)
                      : foundScore.scores || {};
              } catch (err) {
                  console.error('Error parsing scores:', err);
                  parsedScores = {};
              }
              setCurrentScores(parsedScores);
              setComments(foundScore.comments || '');
            } else {
              setIsSubmitted(false); // Unlock if no score found
              setSubmittedScore(null);
              setCurrentScores({});
              setComments('');
            }

            // --- NEW: Force lock if division is validated ---
            if (isDivisionValidated) {
              setIsSubmitted(true);
            }

        } else {
            setIsSubmitted(false);
            setSubmittedScore(null);
        }
    }, [selectedContestant, category, myScores, activePageant]);


    const divisionContestants = useMemo(() => {
      let baseContestants = selectedDivision 
        ? getCheckedInContestants().filter(c => c.division === selectedDivision)
        : [];
      
      if (category === 'photogenic') {
        return baseContestants.filter(c => c.photogenic === 1);
      }
      
      if (category === 'casual_wear') {
        return baseContestants.filter(c => c.casual_wear === 1);
      }
      
      return baseContestants;
      
    }, [selectedDivision, category, contestants, activePageantId]); 

    const handleScoreChange = (criterion, value) => {
      if (isSubmitted) return; 

      const numValue = parseFloat(value);
      const maxScore = category === 'photogenic' ? 100 : 25;
      
      if (!isNaN(numValue) && numValue >= 0 && numValue <= maxScore) {
        setCurrentScores(prev => ({
          ...prev,
          [criterion]: numValue
        }));
      }
    };

    const submitScore = async () => {
      if (!selectedContestant || isSubmitted) return;
      
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
        
        const response = await api.getScoresByJudge(activePageantId, user);
        
        let scoresArray = [];
        if (Array.isArray(response.data)) {
            scoresArray = response.data;
        } else if (response.data?.scores && Array.isArray(response.data.scores)) {
            scoresArray = response.data.scores;
        } else {
            console.warn("Unexpected scores response after submit:", response.data);
        }
        setMyScores(scoresArray);
        
        onScoreSubmitted(); // Tell App to reload all scores

        console.log("Submitting score:", {
            currentScores,
            total,
            calculatedTotal: Object.values(currentScores).reduce((a, b) => a + Number(b || 0), 0)
            });
        alert('Score submitted successfully!');
        
      } catch (error) {
        console.error('Error submitting score:', error);
        alert('Error submitting score. It may have already been submitted.');
      }
    };
    
    const currentTotal = Object.values(currentScores).reduce((a, b) => a + b, 0);
    let maxTotal = 100; // Default
    if (category === 'photogenic') {
      maxTotal = 100;
    } else if (category === 'beauty') {
      maxTotal = 25 * 4;
    } else if (category === 'casual_wear') {
      maxTotal = 25 * 4;
    }

    if (!activePageantId) {
      return (
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex justify-end mb-6">
             <button onClick={() => setUser(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
              Logout
            </button>
          </div>
          <div className="text-center py-12">
            <Award className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 text-lg">No active pageant. Please wait for the Registrar.</p>
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
            {['beauty', 'photogenic', 'casual_wear'].map(cat => {
              if (cat === 'casual_wear' && activePageant && !activePageant.enable_casual_wear) {
                return null;
              }
              
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat);
                    setSelectedContestant(null); 
                  }}
                  className={`px-4 py-2 rounded capitalize ${category === cat ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}
                >
                  {cat.replace('_', ' ')}
                </button>
              );
            })}
          </div>

          <label className="block mb-2 font-semibold">Select Division:</label>
          <select
            value={selectedDivision}
            onChange={(e) => {
              setSelectedDivision(e.target.value);
              setSelectedContestant(null); 
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
              {category === 'photogenic'
                ? 'No checked-in contestants for this division are registered for Photogenic.'
                : category === 'casual_wear'
                ? 'No checked-in contestants for this division are registered for Casual Wear.'
                : 'No checked-in contestants for this division.'}
            </p>
          )}

          {selectedContestant && (
            <div className="space-y-4">
              {isSubmitted && (
                <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4" role="alert">
                  <p className="font-bold flex items-center"><Lock className="w-4 h-4 mr-2" />Submitted</p>
                  <p>This score is locked. Contact the tabulator to make changes.</p>
                </div>
              )}
              
              <div className={`p-4 rounded ${isSubmitted ? 'bg-gray-100' : 'bg-purple-50'}`}>
                
                <h3 className="text-xl font-semibold mb-4 capitalize">
                  Score #{selectedContestant.contestant_number} - {selectedContestant.name} - {category.replace('_', ' ')}
                </h3>
                
                {criteria[category].map(criterion => (
                  <div key={criterion} className="mb-4">
                    <label className="block mb-1 font-medium">
                      {criterion} {category === 'photogenic' ? '(0-100)' : '(0-25)'}
                    </label>
                    
                    {criteriaInfo[criterion] && criteriaInfo[criterion].length > 0 && (
                      <ul className="text-xs text-gray-600 list-disc list-inside mb-2">
                        {criteriaInfo[criterion].map(info => <li key={info}>{info}</li>)}
                      </ul>
                    )}
                    
                    <input
                      type="number"
                      min="0"
                      max={category === 'photogenic' ? 100 : 25}
                      step={category === 'photogenic' ? 1 : 0.5}
                      value={currentScores[criterion] !== undefined ? currentScores[criterion] : ''}
                      onChange={(e) => handleScoreChange(criterion, e.target.value)}
                      className="w-full border rounded p-2"
                      readOnly={isSubmitted} 
                      disabled={isSubmitted} 
                    />
                  </div>
                ))}

                <div className="mb-4">
                  <label className="block mb-1 font-medium">Comments (Optional)</label>
                  <textarea
                    value={comments}
                    onChange={(e) => { if (!isSubmitted) setComments(e.target.value); }}
                    className="w-full border rounded p-2"
                    rows="3"
                    placeholder="Add any comments here..."
                    readOnly={isSubmitted} 
                    disabled={isSubmitted} 
                  />
                </div>
                <div className="mt-4 pt-4 border-t">
                  <div className="text-lg font-bold">
                    Total: {currentTotal.toFixed(1)} / {maxTotal}
                  </div>
                </div>
              </div>
              
              {!isSubmitted && (
                <button
                  onClick={submitScore}
                  disabled={Object.keys(currentScores).length !== criteria[category].length}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white py-3 rounded font-semibold"
                >
                  Submit Score
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // ==========================================================
  // ## TabulatorDashboard
  // ==========================================================
  const TabulatorDashboard = () => {
    const [tieBreakRequest, setTieBreakRequest] = useState(null);
    const [divisionFilter, setDivisionFilter] = useState('');
    
    const [validationStatus, setValidationStatus] = useState(''); 
    const [editingScore, setEditingScore] = useState(null); 

    const sortedContestants = useMemo(() => {
      const scoresByC = {};
      
      scores.forEach(score => {
        const contestant = contestants.find(c => c.id === score.contestant_id);
        
        if (contestant && contestant.pageant_id === activePageantId) {
          if (divisionFilter && contestant.division !== divisionFilter) {
            return; 
          }
          
          if (!scoresByC[score.contestant_id]) {
            scoresByC[score.contestant_id] = {
              id: contestant.id,
              name: contestant.name,
              number: contestant.contestant_number,
              division: contestant.division,
              categories: {},
              finalTotal: 0 
            };
          }
          if (!scoresByC[score.contestant_id].categories[score.category]) {
            scoresByC[score.contestant_id].categories[score.category] = [];
          }
          scoresByC[score.contestant_id].categories[score.category].push(score);
        }
      });

      const contestantArray = Object.values(scoresByC);
      contestantArray.forEach(con => {
        let total = 0;
        Object.values(con.categories).forEach(catScores => {
          total += catScores.reduce((sum, s) => sum + s.total, 0);
        });
        con.finalTotal = total;
      });

      return contestantArray.sort((a, b) => b.finalTotal - a.finalTotal);

    }, [scores, contestants, activePageantId, divisionFilter]); 

    const ties = useMemo(() => {
      const categoryTotals = {};
      
      sortedContestants.forEach(data => {
        Object.entries(data.categories).forEach(([category, catScores]) => {
          const categoryKey = category.replace('_', ' ');
          
          if (!categoryTotals[categoryKey]) categoryTotals[categoryKey] = {};
          
          const total = catScores.reduce((sum, s) => sum + s.total, 0);
          
          if (!categoryTotals[categoryKey][total]) categoryTotals[categoryKey][total] = [];
          categoryTotals[categoryKey][total].push({ contestantId: data.id, name: data.name, number: data.number });
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
    }, [sortedContestants]); 

    // ==========================================================
    // ## MODIFIED: divisionValidation
    // ==========================================================
    const divisionValidation = useMemo(() => {
      if (!divisionFilter) return { isValid: false, message: 'Select a division to validate.' };
      if (!activePageant) return { isValid: false, message: 'Loading pageant...' };

      const divContestants = contestants.filter(
        c => c.pageant_id === activePageantId && c.division === divisionFilter && c.checked_in
      );
      
      if(divContestants.length === 0) return { isValid: false, message: 'No checked-in contestants in this division.' };

      const divScores = scores.filter(s => 
        divContestants.some(c => c.id === s.contestant_id)
      );

      const expectedJudges = activePageant.judges?.length || 3;
      let requiredScores = 0;
      let missingDetails = [];
      
      divContestants.forEach(c => {
        let contestantRequired = 0;
        let contestantActual = 0;
        
        // --- Check Beauty ---
        if (c.beauty) {
          const beautyScores = divScores.filter(s => s.contestant_id === c.id && s.category === 'beauty').length;
          contestantRequired += expectedJudges;
          contestantActual += beautyScores;
        }
        
        // --- Check Photogenic ---
        if (c.photogenic) {
          const photoScores = divScores.filter(s => s.contestant_id === c.id && s.category === 'photogenic').length;
          contestantRequired += expectedJudges;
          contestantActual += photoScores;
        }
        
        // --- Check Casual Wear ---
        if (c.casual_wear && activePageant.enable_casual_wear) {
          const casualScores = divScores.filter(s => s.contestant_id === c.id && s.category === 'casual_wear').length;
          contestantRequired += expectedJudges;
          contestantActual += casualScores;
        }
        
        if (contestantActual < contestantRequired) {
            missingDetails.push(`Contestant #${c.contestant_number} (${c.name}) is missing ${contestantRequired - contestantActual} scores.`);
        }
        requiredScores += contestantRequired;
      });
      
      const actualScores = divScores.length;

      if (actualScores < requiredScores) {
        const message = `Missing ${requiredScores - actualScores} scores for this division.` + "\n" + missingDetails.join("\n");
        return { isValid: false, message: message };
      }
      
      if (missingDetails.length > 0) {
         return { isValid: false, message: "Score counts mismatch. " + missingDetails.join("\n") };
      }
      
      return { isValid: true, message: 'All scores are in for this division.' };

    }, [divisionFilter, contestants, scores, activePageant, activePageantId]);

    const requestTieBreak = (tie) => {
      setTieBreakRequest({
        ...tie,
        instructions: `Tie in ${tie.category}: ${tie.contestants.map(c => `#${c.number} ${c.name}`).join(', ')} (${tie.total} pts each)`
      });
    };
    
    const handleValidateDivision = async () => {
      if (!divisionValidation.isValid) {
        alert("Cannot validate division: " + divisionValidation.message);
        return;
      }
      
      setValidationStatus('Validating division...');
      setLoading(true);
      
      try {
        await api.validateDivision(activePageantId, divisionFilter);
        setValidationStatus(`Division "${divisionFilter}" has been validated! The Registrar can now send the scores.`);
        loadPageants(); // Reload pageants to get updated validation status
      } catch (error) {
        console.error('Error validating division:', error);
        setValidationStatus('An error occurred during validation.');
      } finally {
        setLoading(false);
        setTimeout(() => setValidationStatus(''), 5000); 
      }
    };
    
    const ScoreEditModal = ({ score, onClose, onSave }) => {
      const [newTotal, setNewTotal] = useState(score.total);
      const [newComments, setNewComments] = useState(score.comments || '');
      const [newScores, setNewScores] = useState(score.scores);

      const handleSave = async () => {
        try {
          await api.updateScore(score.id, {
            total: parseFloat(newTotal),
            comments: newComments,
            scores: newScores
          });
          onSave(); 
          onClose();
        } catch (err) {
          alert('Failed to update score.');
        }
      };

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="font-bold text-xl mb-4">Edit Score</h3>
            <p className="mb-2">Judge: <span className="font-medium">{score.judge_name}</span></p>
            <p className="mb-4">Category: <span className="font-medium capitalize">{score.category.replace('_', ' ')}</span></p>
            
            <div className="space-y-2 mb-4">
              {Object.entries(newScores).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center">
                  <label>{key}</label>
                  <input
                    type="number"
                    step="0.5"
                    value={value}
                    onChange={(e) => {
                      const updatedScores = {...newScores, [key]: parseFloat(e.target.value) || 0};
                      setNewScores(updatedScores);
                      setNewTotal(Object.values(updatedScores).reduce((a, b) => a + b, 0));
                    }}
                    className="w-24 border rounded p-1"
                  />
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="block font-medium mb-1">Total Score (Read-only)</label>
              <input
                type="number"
                value={newTotal}
                readOnly
                disabled
                className="w-full border rounded p-2 bg-gray-100"
              />
            </div>
            <div className="mb-4">
              <label className="block font-medium mb-1">Comments</label>
              <textarea
                value={newComments}
                onChange={(e) => setNewComments(e.target.value)}
                className="w-full border rounded p-2"
                rows="3"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">
                Save Changes
              </button>
              <button onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded">
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    };

    if (!activePageantId) {
      return (
        <div className="p-6 max-w-6xl mx-auto">
          <div className="flex justify-end mb-6">
             <button onClick={() => setUser(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
              Logout
            </button>
          </div>
          <div className="text-center py-12">
            <Award className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 text-lg">No active pageant. Please wait for the Registrar.</p>
          </div>
        </div>
      );
    }
    
    const isDivisionValidated = activePageant?.validated_divisions?.includes(divisionFilter);

    return (
      <div className="p-6 max-w-6xl mx-auto">
        {editingScore && (
          <ScoreEditModal
            score={editingScore}
            onClose={() => setEditingScore(null)}
            onSave={() => loadAllScores()} 
          />
        )}
      
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">Tabulator Dashboard</h2>
            <p className="text-gray-600">Pageant: {activePageant?.name}</p>
          </div>
          <button onClick={() => setUser(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
            Logout
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold text-xl mb-4">Division Validation</h3>
          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="w-full border rounded p-2 mb-4"
          >
            <option value="">-- Select Division to Validate --</option>
            {divisions.map(div => (
              <option key={div} value={div}>{div}</option>
            ))}
          </select>

          {divisionFilter && (
            <div className={`p-4 rounded mb-4 ${divisionValidation.isValid ? 'bg-green-100 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
              <p className={`font-medium whitespace-pre-wrap ${divisionValidation.isValid ? 'text-green-800' : 'text-amber-800'}`}>
                {divisionValidation.message}
              </p>
              {isDivisionValidated && (
                <p className="font-bold text-green-800 mt-2">This division has already been validated.</p>
              )}
            </div>
          )}

          <button
            onClick={handleValidateDivision}
            disabled={!divisionValidation.isValid || loading || isDivisionValidated}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white p-4 rounded-lg flex items-center justify-center space-x-2"
          >
            <UserCheck className="w-5 h-5" />
            <span>{loading ? 'Validating...' : `Validate ${divisionFilter || 'Division'}`}</span>
          </button>
          {validationStatus && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4 text-center">
              <p className="text-blue-800 font-medium">{validationStatus}</p>
            </div>
          )}
        </div>


        {ties.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-6 mb-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 mt-1" />
              <div className="flex-1">
                <h3 className="font-bold text-lg text-amber-900 mb-2">Ties Detected in {divisionFilter || 'All Divisions'}</h3>
                {ties.map((tie, idx) => (
                  <div key={idx} className="bg-white rounded p-3 mb-2">
                    <p className="font-medium capitalize">
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
              Instruct judges to review scores. You can manually edit a score below to resolve the tie.
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
          <div className="p-4 bg-gray-100 border-b flex justify-between items-center">
            <h3 className="font-semibold text-lg">Scores (Sorted High to Low)</h3>
          </div>

          <div className="p-4 space-y-6">
            {sortedContestants.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                {divisionFilter 
                  ? 'No scores submitted for this division' 
                  : 'Select a division to view scores'}
              </p>
            ) : (
              sortedContestants.map((data) => (
                <div key={data.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-lg">
                      #{data.number} - {data.name}
                    </h4>
                    <span className="text-2xl font-bold text-purple-600">
                      Total: {data.finalTotal.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Division: {data.division}</p>
                  
                  {Object.entries(data.categories).map(([category, catScores]) => {
                    const totalScore = catScores.reduce((sum, s) => sum + s.total, 0);
                    const avgScore = (totalScore / catScores.length).toFixed(1);
                    
                    return (
                      <div key={category} className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="font-semibold capitalize text-purple-600">{category.replace('_', ' ')}</h5>
                          <div className="text-sm">
                            <span className="font-bold">Total: {totalScore.toFixed(1)}</span>
                            <span className="text-gray-500 ml-2">Avg: {avgScore}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {catScores.map((score, idx) => {
                            // ==========================================================
                            // ## MODIFIED: Hide edit button if division is validated
                            // ==========================================================
                            const isDivisionValidated = activePageant?.validated_divisions?.includes(data.division);
                            return (
                              <div key={idx} className="bg-gray-50 p-3 rounded">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium">{score.judge_name}</span>
                                  
                                  {/* --- HIDE BUTTON IF VALIDATED --- */}
                                  {!isDivisionValidated && (
                                    <button
                                      onClick={() => setEditingScore(score)}
                                      className="text-blue-600 hover:text-blue-800"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
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
                            );
                          })}
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
  // ==========================================================
  // ## MODIFIED: Pass activePageant prop
  // ==========================================================
  if (judgeNames.includes(user)) return <JudgeDashboard onScoreSubmitted={loadAllScores} activePageant={activePageant} />;
  if (user === 'Tabulator') return <TabulatorDashboard />;
  return null;
}

export default App;
import axios from 'axios';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

api.interceptors.request.use(
  config => {
    console.log('API Request:', config.method.toUpperCase(), config.url);
    return config;
  },
  error => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  response => {
    console.log('API Response:', response.config.url, response.status);
    return response;
  },
  error => {
    if (error.response) {
      console.error('API Error Response:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('API No Response - Network Error');
    } else {
      console.error('API Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export const getPageants = () => api.get('/pageants');
export const createPageant = (pageantData) => api.post('/pageants', pageantData);
export const setActivePageant = (id) => api.put(`/pageants/${id}/active`);
export const getActivePageant = () => api.get('/pageants/active');

export const getContestants = (pageantId) => api.get(`/contestants/${pageantId}`);
export const createContestant = (data) => api.post('/contestants', data);
export const updateContestant = (id, data) => api.put(`/contestants/${id}`, data);
export const bulkCreateContestants = (contestants) => api.post('/contestants/bulk', { contestants });
export const updateCheckIn = (id, checked_in, contestant_number) => api.put(`/contestants/${id}/checkin`, { checked_in, contestant_number });
export const updatePayment = (id, paid, balance) => api.put(`/contestants/${id}/payment`, { paid, balance });
export const getDivisions = (pageantId) => api.get(`/divisions/${pageantId}`);

export const getScores = (pageantId) => api.get(`/scores/${pageantId}`);
export const createScore = (data) => api.post('/scores', data);
// ADDED: New endpoints
export const updateScore = (id, data) => api.put(`/api/scores/${id}`, data);
export const getScoresByJudge = (pageantId, judgeName) => api.get(`/api/scores/judge/${pageantId}/${judgeName}`);

// MODIFIED: Now sends division
export const sendScoreSheets = (pageantId, division) => api.post('/scores/send', { pageantId, division });

export default api;
/**
 * Velvet API client
 * Talks to Cloudflare Pages Functions at /api/*
 */
const VelvetAPI = (() => {
  const BASE = '/api';

  function getToken(type = 'user') {
    return localStorage.getItem(type === 'admin' ? 'adminToken' : 'userToken');
  }

  function setToken(token, type = 'user') {
    localStorage.setItem(type === 'admin' ? 'adminToken' : 'userToken', token);
  }

  function clearToken(type = 'user') {
    localStorage.removeItem(type === 'admin' ? 'adminToken' : 'userToken');
    if (type === 'user') localStorage.removeItem('user');
  }

  async function request(path, options = {}, type = 'user') {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = getToken(type);
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE}/${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  return {
    getToken,
    setToken,
    clearToken,

    // User auth
    async register(username, password) {
      const data = await request('auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setToken(data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return data;
    },

    async login(username, password) {
      const data = await request('auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setToken(data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return data;
    },

    async getMe() {
      const data = await request('auth/me');
      localStorage.setItem('user', JSON.stringify(data.user));
      return data.user;
    },

    logout() {
      clearToken('user');
    },

    // User actions
    async redeemKey(key, hwid) {
      const data = await request('keys/redeem', {
        method: 'POST',
        body: JSON.stringify({ key, hwid })
      });
      localStorage.setItem('user', JSON.stringify(data.user));
      return data;
    },

    async resetHwid() {
      const data = await request('hwid/reset', { method: 'POST', body: '{}' });
      localStorage.setItem('user', JSON.stringify(data.user));
      return data;
    },

    // Admin auth
    async adminLogin(username, password) {
      const data = await request('admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      }, 'admin');
      setToken(data.token, 'admin');
      return data;
    },

    async adminMe() {
      return request('admin/me', {}, 'admin');
    },

    adminLogout() {
      clearToken('admin');
    },

    // Admin CRUD
    adminGet(path) {
      return request(`admin/${path}`, {}, 'admin');
    },

    adminPost(path, body) {
      return request(`admin/${path}`, {
        method: 'POST',
        body: JSON.stringify(body)
      }, 'admin');
    },

    adminPut(path, body) {
      return request(`admin/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      }, 'admin');
    },

    adminDelete(path) {
      return request(`admin/${path}`, { method: 'DELETE' }, 'admin');
    }
  };
})();

if (typeof module !== 'undefined') module.exports = VelvetAPI;

let allUsers = [];
let allKeys = [];

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  setupEventListeners();
});

async function checkAdminAuth() {
  if (!VelvetAPI.getToken('admin')) {
    showLogin();
    return;
  }
  try {
    await VelvetAPI.adminMe();
    showDashboard();
  } catch {
    VelvetAPI.adminLogout();
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-container').classList.remove('hidden');
  document.getElementById('admin-dashboard').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('admin-dashboard').classList.remove('hidden');
  loadUsers();
  loadKeys();
  loadHwids();
  updateStats();
}

function setupEventListeners() {
  document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('search-users').addEventListener('input', handleSearchUsers);

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('close-edit-modal').addEventListener('click', closeEditModal);
  document.getElementById('cancel-edit').addEventListener('click', closeEditModal);
  document.getElementById('edit-user-form').addEventListener('submit', handleEditUser);

  document.getElementById('create-key-btn').addEventListener('click', openCreateKeyModal);
  document.getElementById('close-key-modal').addEventListener('click', closeCreateKeyModal);
  document.getElementById('cancel-key').addEventListener('click', closeCreateKeyModal);
  document.getElementById('create-key-form').addEventListener('submit', handleCreateKey);

  document.getElementById('add-hwid-btn').addEventListener('click', openAddHwidModal);
  document.getElementById('close-hwid-modal').addEventListener('click', closeAddHwidModal);
  document.getElementById('cancel-hwid').addEventListener('click', closeAddHwidModal);
  document.getElementById('add-hwid-form').addEventListener('submit', handleAddHwid);
  document.getElementById('reset-all-hwids-btn').addEventListener('click', resetAllHwids);

  ['edit-modal', 'create-key-modal', 'add-hwid-modal'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
      if (e.target.id === id) {
        if (id === 'edit-modal') closeEditModal();
        if (id === 'create-key-modal') closeCreateKeyModal();
        if (id === 'add-hwid-modal') closeAddHwidModal();
      }
    });
  });
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('admin-username').value;
  const password = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('login-error');

  try {
    await VelvetAPI.adminLogin(username, password);
    errorEl.textContent = '';
    showDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function handleLogout() {
  VelvetAPI.adminLogout();
  showLogin();
  document.getElementById('admin-login-form').reset();
}

function switchTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.remove('active');
    c.classList.add('hidden');
  });
  const activeTab = document.getElementById(`tab-${tabName}`);
  activeTab.classList.add('active');
  activeTab.classList.remove('hidden');

  if (tabName === 'users') loadUsers();
  if (tabName === 'keys') loadKeys();
  if (tabName === 'hwid') loadHwids();
}

async function loadUsers(filter = '') {
  try {
    const data = await VelvetAPI.adminGet('users');
    allUsers = data.users;
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';

    const filtered = allUsers.filter(u =>
      u.username.toLowerCase().includes(filter.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No users found</td></tr>';
      return;
    }

    filtered.forEach(user => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.email || 'N/A')}</td>
        <td><span class="hwid-display">${user.hwid ? maskHwid(user.hwid) : 'N/A'}</span></td>
        <td>${user.key ? `<code class="key-display">${maskKey(user.key)}</code>` : 'None'}</td>
        <td>${formatDate(user.createdAt)}</td>
        <td><span class="status-badge status-${user.status || 'active'}">${user.status || 'active'}</span></td>
        <td>
          <button class="action-btn" data-action="edit" data-id="${user.id}">Edit</button>
          <button class="action-btn delete" data-action="delete" data-id="${user.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (btn.dataset.action === 'edit') editUser(id);
        if (btn.dataset.action === 'delete') deleteUser(id);
      });
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadKeys() {
  try {
    const data = await VelvetAPI.adminGet('keys');
    allKeys = data.keys;
    const tbody = document.getElementById('keys-table-body');
    tbody.innerHTML = '';

    if (allKeys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No keys found</td></tr>';
      return;
    }

    allKeys.forEach((key, index) => {
      const row = document.createElement('tr');
      row.style.animation = `fade-in-row 0.3s ease-out ${index * 0.05}s both`;
      const hwidCell = key.lockedHwid
        ? `<span class="hwid-display" title="${escapeHtml(key.lockedHwid)}">${maskHwid(key.lockedHwid)}</span>`
        : '<span class="status-badge status-active">Unlocked</span>';

      row.innerHTML = `
        <td><code class="key-display">${escapeHtml(key.key)}</code></td>
        <td>${hwidCell}</td>
        <td>${formatDate(key.createdAt)}</td>
        <td>${key.expires === 'lifetime' ? 'Lifetime' : formatDate(key.expires)}</td>
        <td><span class="status-badge status-${key.status || 'active'}">${key.status || 'active'}</span></td>
        <td>
          <button class="action-btn" data-copy="${escapeHtml(key.key)}">Copy</button>
          ${key.lockedHwid ? `<button class="action-btn" data-reset="${key.id}">Reset HWID</button>` : ''}
          <button class="action-btn delete" data-delete-key="${key.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => copyKey(btn.dataset.copy));
    });
    tbody.querySelectorAll('[data-reset]').forEach(btn => {
      btn.addEventListener('click', () => resetKeyHwid(btn.dataset.reset));
    });
    tbody.querySelectorAll('[data-delete-key]').forEach(btn => {
      btn.addEventListener('click', () => deleteKey(btn.dataset.deleteKey));
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadHwids() {
  try {
    const data = await VelvetAPI.adminGet('hwids');
    const tbody = document.getElementById('hwid-table-body');
    tbody.innerHTML = '';

    if (data.hwids.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted)">No banned HWIDs</td></tr>';
    } else {
      data.hwids.forEach((hwid, index) => {
        const row = document.createElement('tr');
        row.style.animation = `fade-in-row 0.3s ease-out ${index * 0.05}s both`;
        row.innerHTML = `
          <td><code class="hwid-display">${maskHwid(hwid.hwid)}</code></td>
          <td>${escapeHtml(hwid.reason)}</td>
          <td>${formatDate(hwid.addedAt)}</td>
          <td><button class="action-btn delete" data-remove-hwid="${hwid.id}">Remove</button></td>
        `;
        tbody.appendChild(row);
      });
      tbody.querySelectorAll('[data-remove-hwid]').forEach(btn => {
        btn.addEventListener('click', () => removeHwid(btn.dataset.removeHwid));
      });
    }

    const lockedKeys = allKeys.filter(k => k.lockedHwid);
    const lockedTbody = document.getElementById('hwid-keys-table-body');
    lockedTbody.innerHTML = '';

    if (lockedKeys.length === 0) {
      lockedTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--muted)">No locked HWIDs on keys</td></tr>';
    } else {
      lockedKeys.forEach((key, index) => {
        const row = document.createElement('tr');
        row.style.animation = `fade-in-row 0.3s ease-out ${index * 0.05}s both`;
        row.innerHTML = `
          <td><code class="key-display">${escapeHtml(key.key)}</code></td>
          <td><code class="hwid-display">${maskHwid(key.lockedHwid)}</code></td>
          <td><button class="action-btn" data-reset="${key.id}">Reset HWID</button></td>
        `;
        lockedTbody.appendChild(row);
      });
      lockedTbody.querySelectorAll('[data-reset]').forEach(btn => {
        btn.addEventListener('click', () => resetKeyHwid(btn.dataset.reset));
      });
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateStats() {
  try {
    const stats = await VelvetAPI.adminGet('stats');
    document.getElementById('total-users').textContent = stats.totalUsers;
    document.getElementById('active-keys').textContent = stats.activeKeys;
    document.getElementById('banned-hwids').textContent = stats.bannedHwids;
  } catch {
    // stats optional on load
  }
}

function handleSearchUsers(e) {
  loadUsers(e.target.value);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function maskHwid(hwid) {
  if (!hwid || hwid.length < 8) return hwid || '';
  return hwid.substring(0, 4) + '****' + hwid.substring(hwid.length - 4);
}

function maskKey(key) {
  if (!key) return '';
  if (key.startsWith('VELVET-')) return 'VELVET-' + '*'.repeat(12);
  return key.substring(0, 4) + '****';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function editUser(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('edit-user-id').value = user.id;
  document.getElementById('edit-username').value = user.username;
  document.getElementById('edit-email').value = user.email || '';
  document.getElementById('edit-hwid').value = user.hwid || '';
  document.getElementById('edit-status').value = user.status || 'active';

  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
  setTimeout(() => document.getElementById('edit-modal').classList.add('hidden'), 300);
}

async function handleEditUser(e) {
  e.preventDefault();
  const userId = document.getElementById('edit-user-id').value;

  try {
    await VelvetAPI.adminPut(`users/${userId}`, {
      username: document.getElementById('edit-username').value,
      email: document.getElementById('edit-email').value,
      hwid: document.getElementById('edit-hwid').value,
      status: document.getElementById('edit-status').value
    });
    closeEditModal();
    loadUsers();
    updateStats();
    showToast('User updated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(userId) {
  try {
    await VelvetAPI.adminDelete(`users/${userId}`);
    loadUsers();
    updateStats();
    showToast('User deleted', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCreateKeyModal() {
  document.getElementById('create-key-form').reset();
  document.getElementById('create-key-modal').classList.remove('hidden');
  document.getElementById('create-key-modal').classList.add('active');
}

function closeCreateKeyModal() {
  document.getElementById('create-key-modal').classList.remove('active');
  setTimeout(() => document.getElementById('create-key-modal').classList.add('hidden'), 300);
}

async function handleCreateKey(e) {
  e.preventDefault();
  const duration = document.getElementById('key-duration').value.trim();
  const note = document.getElementById('key-note').value;

  try {
    const data = await VelvetAPI.adminPost('keys', { duration, note });
    closeCreateKeyModal();
    loadKeys();
    updateStats();
    showToast(`Key created: ${data.key.key}`, 'success');
    await navigator.clipboard.writeText(data.key.key);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function resetKeyHwid(keyId) {
  try {
    await VelvetAPI.adminPost(`keys/${keyId}/reset-hwid`, {});
    loadKeys();
    loadHwids();
    showToast('HWID lock reset', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function copyKey(key) {
  navigator.clipboard.writeText(key).then(() => showToast('Key copied', 'success'));
}

async function deleteKey(keyId) {
  try {
    await VelvetAPI.adminDelete(`keys/${keyId}`);
    loadKeys();
    updateStats();
    showToast('Key deleted', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAddHwidModal() {
  document.getElementById('add-hwid-form').reset();
  document.getElementById('add-hwid-modal').classList.remove('hidden');
  document.getElementById('add-hwid-modal').classList.add('active');
}

function closeAddHwidModal() {
  document.getElementById('add-hwid-modal').classList.remove('active');
  setTimeout(() => document.getElementById('add-hwid-modal').classList.add('hidden'), 300);
}

async function handleAddHwid(e) {
  e.preventDefault();
  try {
    await VelvetAPI.adminPost('hwids', {
      hwid: document.getElementById('hwid-input').value,
      reason: document.getElementById('hwid-reason').value
    });
    closeAddHwidModal();
    loadHwids();
    updateStats();
    showToast('HWID blacklisted', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeHwid(hwidId) {
  try {
    await VelvetAPI.adminDelete(`hwids/${hwidId}`);
    loadHwids();
    updateStats();
    showToast('HWID removed', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function resetAllHwids() {
  if (!confirm('Reset all HWID locks on keys?')) return;
  try {
    await VelvetAPI.adminPost('hwids/reset-all', {});
    loadKeys();
    loadHwids();
    showToast('All HWID locks reset', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = `toast toast-${type}`; }, 2500);
}

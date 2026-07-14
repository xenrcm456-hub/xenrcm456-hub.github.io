function getInitial(username) {
  return (username || 'U').charAt(0).toUpperCase();
}

function formatExpiry(expires) {
  if (!expires) return 'No license';
  if (expires === 'lifetime') return 'Never';
  const date = new Date(expires);
  if (Number.isNaN(date.getTime())) return expires;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getNextMonthFirst() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function maskLicenseKey(key) {
  if (!key) return 'No license';
  const prefix = key.startsWith('VELVET-') ? 'VELVET-' : key.split('-')[0] + '-';
  return prefix + '*'.repeat(Math.max(12, key.length - prefix.length));
}

function getRemainingLabel(expires) {
  if (!expires) return 'Redeem a key to activate';
  if (expires === 'lifetime') return 'Lifetime access';
  const expiry = new Date(expires);
  const now = new Date();
  const diff = expiry - now;
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 30) return `${days} days remaining`;
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours} hours remaining`;
}

function getProgressPercent(expires) {
  if (!expires) return 0;
  if (expires === 'lifetime') return 100;
  const expiry = new Date(expires);
  const now = new Date();
  const total = expiry - now;
  if (total <= 0) return 0;
  const thirtyDays = 30 * 86400000;
  return Math.min(100, Math.max(8, (total / thirtyDays) * 100));
}

function generateHwid() {
  let hwid = localStorage.getItem('simulatedHwid');
  if (!hwid) {
    hwid = 'HWID-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    localStorage.setItem('simulatedHwid', hwid);
  }
  return hwid;
}

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.dataset.page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`page-${pageId}`);
      if (target) target.classList.add('active');
      closeSidebar();
    });
  });
}

function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('sidebar-toggle');

  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });
  overlay?.addEventListener('click', closeSidebar);
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
}

function populateUserUI(user) {
  const initial = getInitial(user.username);
  document.getElementById('sidebar-username').textContent = user.username;
  document.getElementById('sidebar-avatar').textContent = initial;
  document.getElementById('account-username').textContent = user.username;
  document.getElementById('account-avatar').textContent = initial;

  const key = user.key || null;
  const licenseEl = document.getElementById('license-key-display');
  licenseEl.textContent = key ? maskLicenseKey(key) : 'No license';

  document.getElementById('plan-value').textContent = user.expires === 'lifetime' ? 'Lifetime' : (user.key ? 'Licensed' : 'Free');
  document.getElementById('status-value').textContent = user.key ? 'Active' : 'Inactive';
  document.getElementById('status-value').className = `meta-value ${user.key ? 'status-active' : ''}`;
  document.getElementById('expires-value').textContent = formatExpiry(user.expires);
  document.getElementById('progress-label').textContent = getRemainingLabel(user.expires);
  document.getElementById('progress-fill').style.width = `${getProgressPercent(user.expires)}%`;

  const hwidResets = user.hwidResetsUsed ?? 0;
  document.getElementById('resets-used').textContent = `${hwidResets}/3`;
  document.getElementById('hwid-banner-text').textContent =
    hwidResets >= 3
      ? `You've used all HWID resets this month. They reset on ${getNextMonthFirst()}.`
      : `You've used ${hwidResets} of 3 HWID resets this month. They reset on ${getNextMonthFirst()}.`;

  if (key) setupLicenseControls(key, licenseEl);
  setupHwidReset(user);
  setupRedeem(user);
  startUptimeTimer();
}

function setupLicenseControls(key, licenseEl) {
  const showBtn = document.getElementById('show-license');
  const copyBtn = document.getElementById('copy-license');
  let isMasked = true;

  showBtn.replaceWith(showBtn.cloneNode(true));
  copyBtn.replaceWith(copyBtn.cloneNode(true));

  document.getElementById('show-license').addEventListener('click', () => {
    isMasked = !isMasked;
    licenseEl.textContent = isMasked ? maskLicenseKey(key) : key;
  });

  document.getElementById('copy-license').addEventListener('click', () => {
    navigator.clipboard.writeText(key);
    const prev = licenseEl.textContent;
    licenseEl.textContent = 'Copied!';
    setTimeout(() => { licenseEl.textContent = isMasked ? maskLicenseKey(key) : key; }, 1000);
  });

  document.getElementById('renew-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-page="settings"]')?.click();
    document.getElementById('redeem-input')?.focus();
  });
}

function setupHwidReset(user) {
  const btn = document.getElementById('hwid-reset-btn');
  btn.replaceWith(btn.cloneNode(true));

  document.getElementById('hwid-reset-btn').addEventListener('click', async () => {
    try {
      const data = await VelvetAPI.resetHwid();
      populateUserUI(data.user);
      alert('HWID reset successfully.');
    } catch (err) {
      alert(err.message);
    }
  });
}

function setupRedeem(user) {
  const btn = document.getElementById('redeem-btn');
  const input = document.getElementById('redeem-input');
  btn.replaceWith(btn.cloneNode(true));

  document.getElementById('redeem-btn').addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) {
      alert('Enter a license key.');
      return;
    }
    if (!value.toUpperCase().startsWith('VELVET-')) {
      alert('Invalid key format. Keys start with VELVET-.');
      return;
    }

    try {
      const data = await VelvetAPI.redeemKey(value, generateHwid());
      input.value = '';
      populateUserUI(data.user);
      alert('Key redeemed successfully and locked to your HWID.');
    } catch (err) {
      alert(err.message);
    }
  });
}

let uptimeInterval = null;

function startUptimeTimer() {
  if (uptimeInterval) clearInterval(uptimeInterval);
  let seconds = 0;
  uptimeInterval = setInterval(() => {
    seconds++;
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    const el = document.getElementById('uptime');
    if (el) el.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function initializeDashboard(user) {
  populateUserUI(user);
  setupNavigation();
  setupSidebar();

  const signout = document.getElementById('signout');
  signout.replaceWith(signout.cloneNode(true));
  document.getElementById('signout').addEventListener('click', (e) => {
    e.preventDefault();
    VelvetAPI.logout();
    if (uptimeInterval) clearInterval(uptimeInterval);
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.4s ease';
  setTimeout(() => { document.body.style.opacity = '1'; }, 50);

  if (!VelvetAPI.getToken()) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const user = await VelvetAPI.getMe();
    initializeDashboard(user);
    try { setupConfigInterface(); } catch (e) { console.warn('Config UI skipped', e); }
  } catch {
    VelvetAPI.logout();
    window.location.href = 'index.html';
  }
});

function setupConfigInterface() {
  const savedConfig = JSON.parse(localStorage.getItem('velvetConfig') || '{}');

  setupSlider('aimbot-fov', savedConfig.aimbot?.fov || 100);
  setupSlider('aimbot-smoothing', savedConfig.aimbot?.smoothing || 10);
  setupCheckbox('aimbot-enabled', savedConfig.aimbot?.enabled || false);
  setupCheckbox('aimbot-teamcheck', savedConfig.aimbot?.teamcheck || false);
  setupCheckbox('aimbot-sticky', savedConfig.aimbot?.sticky || false);

  setupSlider('triggerbot-cps', savedConfig.triggerbot?.cps || 10);
  setupCheckbox('triggerbot-enabled', savedConfig.triggerbot?.enabled || false);
  setupCheckbox('triggerbot-wallcheck', savedConfig.triggerbot?.wallcheck || false);

  setupSlider('speed-value', savedConfig.movement?.speed || 50);
  setupCheckbox('speed-enabled', savedConfig.movement?.speedEnabled || false);
  setupSlider('jump-value', savedConfig.movement?.jump || 50);
  setupCheckbox('jump-enabled', savedConfig.movement?.jumpEnabled || false);
  setupSlider('fly-speed', savedConfig.movement?.flySpeed || 50);
  setupCheckbox('fly-enabled', savedConfig.movement?.flyEnabled || false);

  setupCheckbox('esp-enabled', savedConfig.visuals?.espEnabled || false);
  setupCheckbox('esp-box', savedConfig.visuals?.espBox || false);
  setupCheckbox('esp-name', savedConfig.visuals?.espName || false);
  setupCheckbox('esp-healthbar', savedConfig.visuals?.espHealthbar || false);
  setupCheckbox('esp-distance', savedConfig.visuals?.espDistance || false);
  setupCheckbox('esp-teamcheck', savedConfig.visuals?.espTeamcheck || false);
  setupCheckbox('chams-enabled', savedConfig.visuals?.chamsEnabled || false);
  setupSelect('chams-type', savedConfig.visuals?.chamsType || '0');

  setupCheckbox('fog-enabled', savedConfig.misc?.fogEnabled || false);
  setupSlider('fog-start', savedConfig.misc?.fogStart || 0);
  setupSlider('fog-end', savedConfig.misc?.fogEnd || 500);
  setupCheckbox('shadows-disable', savedConfig.misc?.shadowsDisable || false);
  setupCheckbox('clocktime-enabled', savedConfig.misc?.clocktimeEnabled || false);
  setupSlider('clocktime-value', savedConfig.misc?.clocktimeValue || 12);
  setupCheckbox('antiafk-enabled', savedConfig.misc?.antiafkEnabled || false);

  document.querySelectorAll('.config-slider, .config-checkbox, .config-select').forEach(el => {
    el.addEventListener('input', saveConfig);
    el.addEventListener('change', saveConfig);
  });
}

function setupSlider(id, defaultValue) {
  const slider = document.getElementById(id);
  const valueDisplay = document.getElementById(id + '-value') || document.getElementById(id + '-display') || document.getElementById(id.replace('value', 'value-display'));
  if (slider) {
    slider.value = defaultValue;
    if (valueDisplay) valueDisplay.textContent = defaultValue;
    slider.addEventListener('input', () => {
      if (valueDisplay) valueDisplay.textContent = slider.value;
    });
  }
}

function setupCheckbox(id, defaultValue) {
  const checkbox = document.getElementById(id);
  if (checkbox) checkbox.checked = defaultValue;
}

function setupSelect(id, defaultValue) {
  const select = document.getElementById(id);
  if (select) select.value = defaultValue;
}

function saveConfig() {
  const config = {
    aimbot: {
      enabled: document.getElementById('aimbot-enabled')?.checked || false,
      fov: parseInt(document.getElementById('aimbot-fov')?.value) || 100,
      smoothing: parseInt(document.getElementById('aimbot-smoothing')?.value) || 10,
      teamcheck: document.getElementById('aimbot-teamcheck')?.checked || false,
      sticky: document.getElementById('aimbot-sticky')?.checked || false
    },
    triggerbot: {
      enabled: document.getElementById('triggerbot-enabled')?.checked || false,
      cps: parseInt(document.getElementById('triggerbot-cps')?.value) || 10,
      wallcheck: document.getElementById('triggerbot-wallcheck')?.checked || false
    },
    movement: {
      speedEnabled: document.getElementById('speed-enabled')?.checked || false,
      speed: parseInt(document.getElementById('speed-value')?.value) || 50,
      jumpEnabled: document.getElementById('jump-enabled')?.checked || false,
      jump: parseInt(document.getElementById('jump-value')?.value) || 50,
      flyEnabled: document.getElementById('fly-enabled')?.checked || false,
      flySpeed: parseInt(document.getElementById('fly-speed')?.value) || 50
    },
    visuals: {
      espEnabled: document.getElementById('esp-enabled')?.checked || false,
      espBox: document.getElementById('esp-box')?.checked || false,
      espName: document.getElementById('esp-name')?.checked || false,
      espHealthbar: document.getElementById('esp-healthbar')?.checked || false,
      espDistance: document.getElementById('esp-distance')?.checked || false,
      espTeamcheck: document.getElementById('esp-teamcheck')?.checked || false,
      chamsEnabled: document.getElementById('chams-enabled')?.checked || false,
      chamsType: document.getElementById('chams-type')?.value || '0'
    },
    misc: {
      fogEnabled: document.getElementById('fog-enabled')?.checked || false,
      fogStart: parseInt(document.getElementById('fog-start')?.value) || 0,
      fogEnd: parseInt(document.getElementById('fog-end')?.value) || 500,
      shadowsDisable: document.getElementById('shadows-disable')?.checked || false,
      clocktimeEnabled: document.getElementById('clocktime-enabled')?.checked || false,
      clocktimeValue: parseInt(document.getElementById('clocktime-value')?.value) || 12,
      antiafkEnabled: document.getElementById('antiafk-enabled')?.checked || false
    }
  };
  localStorage.setItem('velvetConfig', JSON.stringify(config));
}

// ══════════════════════════════════════════════════════════
// Dashboard App – Fully Client-Side with IndexedDB
// ══════════════════════════════════════════════════════════

const DB_NAME = 'DevelopDashboardDB';
const DB_VERSION = 1;
let dbInstance = null;

// ── IndexedDB Setup ──────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('categories')) {
        const cs = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
        cs.createIndex('name', 'name', { unique: true });
      }
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        const ts = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        ts.createIndex('date', 'date');
        ts.createIndex('type', 'type');
        ts.createIndex('category_id', 'category_id');
      }
      if (!db.objectStoreNames.contains('investments')) {
        db.createObjectStore('investments', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
  });
}

function dbGetAll(store) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbAdd(store, data) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(store, data) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(store, key) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbCount(store) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbAddBulk(store, items) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const item of items) os.add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Seed Data ────────────────────────────────────────────
async function seedDatabase() {
  const seeded = await dbGet('meta', 'seeded');
  if (seeded) return;

  const categories = [
    { id: 1, name: 'Food', color: '#FF6B6B', icon: '🍔' },
    { id: 2, name: 'Housing', color: '#4ECDC4', icon: '🏠' },
    { id: 3, name: 'Transport', color: '#45B7D1', icon: '🚗' },
    { id: 4, name: 'Shopping', color: '#96CEB4', icon: '🛍️' },
    { id: 5, name: 'Entertainment', color: '#FFEAA7', icon: '🎬' },
    { id: 6, name: 'Health', color: '#DDA0DD', icon: '💊' },
    { id: 7, name: 'Pantry', color: '#F0E68C', icon: '🥫' },
    { id: 8, name: 'Holiday', color: '#87CEEB', icon: '✈️' },
    { id: 9, name: 'Salary', color: '#98D8C8', icon: '💰' },
    { id: 10, name: 'Freelance', color: '#F7DC6F', icon: '💻' },
    { id: 11, name: 'Investment', color: '#BB8FCE', icon: '📈' },
    { id: 12, name: 'Other', color: '#AEB6BF', icon: '📦' }
  ];
  await dbAddBulk('categories', categories);

  const accounts = [
    { id: 1, name: 'Main Account', bank: 'Priobank', card_type: 'mastercard', card_number: '4578', balance: 657850 },
    { id: 2, name: 'Business', bank: 'BCA Bank', card_type: 'visa', card_number: '4578', balance: 200000 }
  ];
  await dbAddBulk('accounts', accounts);

  const investments = [
    { name: 'Studies', category: 'Education', amount: 520, returns: 15, date: '2026-06-01' },
    { name: 'Cryptocurrency', category: 'Crypto', amount: 220, returns: -5, date: '2026-06-01' },
    { name: 'Contributions', category: 'Retirement', amount: 135, returns: 8, date: '2026-06-01' },
    { name: 'Stocks and bonds', category: 'Market', amount: 450, returns: 12, date: '2026-06-01' },
    { name: 'Assets', category: 'Real Estate', amount: 827, returns: 6, date: '2026-06-01' }
  ];
  await dbAddBulk('investments', investments);

  // Generate transactions
  const txs = [];
  const months = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
                   '2025-07','2025-08','2025-09','2025-10','2025-11','2025-12'];
  const incomeBase = [52000,48000,65000,58000,71000,63000,45000,55000,60000,67000,72000,80000];
  const expenseBase = [35000,28000,42000,38000,45000,41000,30000,36000,39000,43000,48000,52000];
  const expCats = [
    { catId: 1, pct: 0.25, merchants: ['Supermarket','Restaurant','Cafe'] },
    { catId: 2, pct: 0.30, merchants: ['Landlord','Utilities','Internet'] },
    { catId: 3, pct: 0.10, merchants: ['Gas Station','Uber','Metro'] },
    { catId: 4, pct: 0.12, merchants: ['Boutique','Amazon','Mall'] },
    { catId: 5, pct: 0.08, merchants: ['Cinema','Spotify','Netflix'] },
    { catId: 6, pct: 0.05, merchants: ['Pharmacy','Gym','Doctor'] },
    { catId: 7, pct: 0.06, merchants: ['Grocery Store','Market'] },
    { catId: 8, pct: 0.04, merchants: ['Hotel','Airlines','Tours'] }
  ];

  const rand = (min, max) => min + Math.random() * (max - min);

  for (let m = 0; m < months.length; m++) {
    const month = months[m];
    const [y, mo] = month.split('-').map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();

    txs.push({ type: 'income', amount: incomeBase[m] * 0.7, category_id: 9, merchant: 'Employer', description: 'Monthly Salary', date: `${month}-01` });
    txs.push({ type: 'income', amount: incomeBase[m] * 0.2, category_id: 10, merchant: 'Client', description: 'Freelance Project', date: `${month}-15` });
    txs.push({ type: 'income', amount: incomeBase[m] * 0.1, category_id: 11, merchant: 'Broker', description: 'Investment Returns', date: `${month}-20` });

    for (const ec of expCats) {
      const total = expenseBase[m] * ec.pct;
      const count = 2 + Math.floor(Math.random() * 3);
      for (let t = 0; t < count; t++) {
        const day = String(1 + Math.floor(Math.random() * daysInMonth)).padStart(2, '0');
        txs.push({
          type: 'expense',
          amount: Math.round(total / count * rand(0.7, 1.3) * 100) / 100,
          category_id: ec.catId,
          merchant: ec.merchants[Math.floor(Math.random() * ec.merchants.length)],
          description: `Expense`,
          date: `${month}-${day}`
        });
      }
    }
  }

  // Weekly daily data
  const weekDays = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-06','2026-06-07'];
  const weekInc = [65000,72000,58000,80000,69000,74000,61000];
  const weekExp = [45000,52000,38000,61000,48000,55000,42000];
  for (let i = 0; i < weekDays.length; i++) {
    txs.push({ type: 'income', amount: weekInc[i], category_id: 9, merchant: 'Various', description: 'Daily income', date: weekDays[i] });
    txs.push({ type: 'expense', amount: weekExp[i], category_id: 1, merchant: 'Various', description: 'Daily expense', date: weekDays[i] });
  }

  await dbAddBulk('transactions', txs);
  await dbPut('meta', { key: 'seeded', value: true });
}

// ── Helpers ──────────────────────────────────────────────
function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtDec(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function isDark() { return document.documentElement.classList.contains('dark'); }
function chartTextColor() { return isDark() ? '#94a3b8' : '#64748b'; }
function chartGridColor() { return isDark() ? 'rgba(148,163,184,0.08)' : 'rgba(0,0,0,0.05)'; }

// ── Chart instances ──────────────────────────────────────
let dissectionChart, categoriesChart, weeklyChart, aggregateChart;

// ── Theme Toggle ─────────────────────────────────────────
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark() ? 'dark' : 'light');
  updateChartsTheme();
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
}

function updateChartsTheme() {
  [dissectionChart, categoriesChart, weeklyChart, aggregateChart].forEach(c => {
    if (!c) return;
    if (c.options.scales?.x) {
      c.options.scales.x.ticks.color = chartTextColor();
      c.options.scales.x.grid.color = chartGridColor();
    }
    if (c.options.scales?.y) {
      c.options.scales.y.ticks.color = chartTextColor();
      c.options.scales.y.grid.color = chartGridColor();
    }
    c.update();
  });
}

// ── Load Summary ─────────────────────────────────────────
async function loadSummary() {
  const accounts = await dbGetAll('accounts');
  const txs = await dbGetAll('transactions');
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

  const curExpenses = txs.filter(t => t.type === 'expense' && t.date.startsWith(curMonth)).reduce((s, t) => s + t.amount, 0);
  const prevExpenses = txs.filter(t => t.type === 'expense' && t.date.startsWith(prevMonth)).reduce((s, t) => s + t.amount, 0);
  const curIncome = txs.filter(t => t.type === 'income' && t.date.startsWith(curMonth)).reduce((s, t) => s + t.amount, 0);
  const prevIncome = txs.filter(t => t.type === 'income' && t.date.startsWith(prevMonth)).reduce((s, t) => s + t.amount, 0);

  const expChange = prevExpenses > 0 ? ((curExpenses - prevExpenses) / prevExpenses * 100).toFixed(1) : 0;
  const incChange = prevIncome > 0 ? ((curIncome - prevIncome) / prevIncome * 100).toFixed(1) : 0;

  document.getElementById('totalBalance').textContent = fmt(totalBalance);
  document.getElementById('totalExpenses').textContent = fmt(curExpenses);

  const bc = document.getElementById('balanceChange');
  bc.textContent = (incChange >= 0 ? '+' : '') + incChange + '% last month';
  bc.className = `text-xs font-medium px-2 py-0.5 rounded-full ${incChange >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`;

  const ec = document.getElementById('expenseChange');
  ec.textContent = (expChange >= 0 ? '+' : '') + expChange + '% last month';
  ec.className = `text-xs font-medium px-2 py-0.5 rounded-full ${expChange <= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`;
}

// ── Load Accounts ────────────────────────────────────────
async function loadAccounts() {
  const accounts = await dbGetAll('accounts');
  const container = document.getElementById('activeCards');
  container.innerHTML = accounts.map(a => `
    <div class="flex items-center gap-3 p-2.5 rounded-xl bg-surface-light dark:bg-surface-dark">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center ${a.card_type === 'visa' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-orange-100 dark:bg-orange-900/40'}">
        <span class="text-xs font-bold ${a.card_type === 'visa' ? 'text-blue-600' : 'text-orange-600'}">${a.card_type === 'visa' ? 'VISA' : 'MC'}</span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-xs text-gray-500 dark:text-gray-400">${a.bank}</div>
        <div class="text-sm font-semibold">${fmtDec(a.balance / 100)}</div>
        <div class="text-[10px] text-gray-400 truncate">3125 7856 0012 ${a.card_number} &nbsp; ${String(new Date().getMonth() + 1).padStart(2, '0')}/${String(new Date().getFullYear()).slice(-2)}</div>
      </div>
    </div>
  `).join('');
}

// ── Load Categories Donut ────────────────────────────────
async function loadCategories() {
  const txs = await dbGetAll('transactions');
  const cats = await dbGetAll('categories');
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

  const totals = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    totals[t.category_id] = (totals[t.category_id] || 0) + t.amount;
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const labels = sorted.map(([id]) => catMap[Number(id)]?.name || 'Other');
  const data = sorted.map(([, v]) => v);
  const colors = sorted.map(([id]) => catMap[Number(id)]?.color || '#aaa');

  const ctx = document.getElementById('categoriesChart').getContext('2d');
  if (categoriesChart) categoriesChart.destroy();
  categoriesChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      cutout: '65%',
      responsive: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 8, padding: 8, font: { size: 10 }, color: chartTextColor(), usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          callbacks: { label: (c) => ` ${c.label}: ${fmt(c.raw)}` }
        }
      }
    }
  });

  // Center text plugin
  const total = data.reduce((s, v) => s + v, 0);
  categoriesChart.options.plugins.tooltip.callbacks.label = (c) => {
    const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0;
    return ` ${c.label}: ${pct}%`;
  };
  const centerPlugin = {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx: c, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      c.save();
      c.font = 'bold 14px Inter';
      c.fillStyle = isDark() ? '#fff' : '#1e293b';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('100%', cx, cy - 6);
      c.font = '9px Inter';
      c.fillStyle = '#94a3b8';
      c.fillText('expenses', cx, cy + 10);
      c.restore();
    }
  };
  categoriesChart.config.plugins = [centerPlugin];
  categoriesChart.update();
}

// ── Load Dissection Bar Chart ────────────────────────────
async function loadDissection() {
  const year = document.getElementById('dissectionYear').value;
  const txs = await dbGetAll('transactions');

  const monthlyData = {};
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    monthlyData[key] = { income: 0, expenses: 0 };
  }

  txs.forEach(t => {
    const m = t.date.substring(0, 7);
    if (m.startsWith(year) && monthlyData[m]) {
      if (t.type === 'income') monthlyData[m].income += t.amount;
      else monthlyData[m].expenses += t.amount;
    }
  });

  const labels = Object.keys(monthlyData).map(k => monthNames[parseInt(k.split('-')[1]) - 1]);
  const incomeData = Object.values(monthlyData).map(d => d.income);
  const expenseData = Object.values(monthlyData).map(d => d.expenses);

  const ctx = document.getElementById('dissectionChart').getContext('2d');
  if (dissectionChart) dissectionChart.destroy();
  dissectionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: '#6C5CE7',
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        },
        {
          label: 'Expenses',
          data: expenseData,
          backgroundColor: '#FF6B9D',
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor(), font: { size: 11 } } },
        y: {
          grid: { color: chartGridColor() },
          ticks: { color: chartTextColor(), font: { size: 11 }, callback: v => v >= 1000 ? (v / 1000) + 'K' : v },
          border: { display: false }
        }
      }
    }
  });
}

// ── Load Spending Parameters (Circular SVG) ──────────────
async function loadSpending() {
  const txs = await dbGetAll('transactions');
  const cats = await dbGetAll('categories');
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

  const totals = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    totals[t.category_id] = (totals[t.category_id] || 0) + t.amount;
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxVal = sorted.length ? sorted[0][1] : 1;

  const grid = document.getElementById('spendingGrid');
  grid.innerHTML = sorted.map(([catId, total]) => {
    const cat = catMap[Number(catId)] || { name: '?', color: '#888' };
    const pct = Math.round(total / maxVal * 100);
    const r = 30, circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    const change = (Math.random() * 10 - 5).toFixed(1);
    const isUp = change >= 0;
    return `
      <div class="flex flex-col items-center text-center">
        <div class="relative w-[70px] h-[70px] mb-2">
          <svg width="70" height="70" viewBox="0 0 70 70">
            <circle cx="35" cy="35" r="${r}" fill="none" stroke="${isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}" stroke-width="5"/>
            <circle cx="35" cy="35" r="${r}" fill="none" stroke="${cat.color}" stroke-width="5"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
              stroke-linecap="round" class="circular-ring" transform="rotate(-90 35 35)"/>
          </svg>
          <span class="absolute inset-0 flex items-center justify-center text-sm font-bold">${pct}%</span>
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium mb-1 ${isUp ? 'bg-red-100 dark:bg-red-900/30 text-red-500' : 'bg-green-100 dark:bg-green-900/30 text-green-500'}">${isUp ? '↑' : '↓'} ${Math.abs(change)}%</span>
        <span class="text-xs text-gray-500 dark:text-gray-400">${cat.name.toLowerCase()}</span>
      </div>`;
  }).join('');
}

// ── Load Recent Transactions ─────────────────────────────
async function loadTransactions(search = '') {
  const txs = await dbGetAll('transactions');
  const cats = await dbGetAll('categories');
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

  let filtered = txs.sort((a, b) => b.date.localeCompare(a.date));
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(t =>
      (t.merchant || '').toLowerCase().includes(s) ||
      (t.description || '').toLowerCase().includes(s) ||
      (catMap[t.category_id]?.name || '').toLowerCase().includes(s)
    );
  }

  const container = document.getElementById('transactionsList');
  container.innerHTML = filtered.slice(0, 5).map(t => {
    const cat = catMap[t.category_id] || { name: 'Other', icon: '📦', color: '#aaa' };
    const d = new Date(t.date + 'T12:00:00');
    const dateStr = `${d.toLocaleString('en', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')}, ${String(8 + Math.floor(Math.random()*12)).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2, '0')}`;
    return `
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style="background:${cat.color}22">${cat.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">${t.merchant || cat.name}</div>
          <div class="text-xs text-gray-400">${dateStr}</div>
        </div>
        <span class="text-sm font-semibold ${t.type === 'income' ? 'text-green-500' : 'text-gray-800 dark:text-gray-200'}">${t.type === 'expense' ? '— $' : '+ $'} ${Number(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>`;
  }).join('');
}

// ── Load Investments ─────────────────────────────────────
async function loadInvestments() {
  const invs = await dbGetAll('investments');
  const container = document.getElementById('investmentsList');
  container.innerHTML = invs.map(inv => `
    <div class="flex items-center justify-between py-1">
      <div>
        <div class="text-sm font-medium">${inv.name}</div>
        <div class="text-xs text-gray-400">${inv.category}</div>
      </div>
      <span class="text-sm font-semibold">$ ${Number(inv.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
    </div>
  `).join('');
}

// ── Load Weekly Line Chart ───────────────────────────────
async function loadWeekly() {
  const txs = await dbGetAll('transactions');
  const days = {};
  const weekDays = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-06','2026-06-07'];
  weekDays.forEach(d => { days[d] = { income: 0, expenses: 0 }; });

  txs.forEach(t => {
    if (days[t.date]) {
      if (t.type === 'income') days[t.date].income += t.amount;
      else days[t.date].expenses += t.amount;
    }
  });

  const labels = weekDays.map(d => dayNames[new Date(d + 'T12:00:00').getDay()]);
  const incomeData = weekDays.map(d => days[d].income);
  const expenseData = weekDays.map(d => days[d].expenses);

  const ctx = document.getElementById('weeklyChart').getContext('2d');
  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          borderColor: '#6C5CE7',
          backgroundColor: 'rgba(108,92,231,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#6C5CE7',
          borderWidth: 2
        },
        {
          label: 'Expenses',
          data: expenseData,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#10B981',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` }
        }
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor(), font: { size: 10 }, maxRotation: 45 } },
        y: {
          grid: { color: chartGridColor() },
          ticks: { color: chartTextColor(), font: { size: 10 }, callback: v => (v / 1000) + 'K' },
          border: { display: false }
        }
      }
    }
  });
}

// ── Load Aggregate (Data Explorer) ───────────────────────
async function loadAggregate() {
  const type = document.getElementById('filterType').value;
  const groupBy = document.getElementById('filterGroupBy').value;
  const metric = document.getElementById('filterMetric').value;
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;

  const txs = await dbGetAll('transactions');
  const cats = await dbGetAll('categories');
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

  let filtered = txs;
  if (type) filtered = filtered.filter(t => t.type === type);
  if (from) filtered = filtered.filter(t => t.date >= from);
  if (to) filtered = filtered.filter(t => t.date <= to);

  // Group
  const groups = {};
  filtered.forEach(t => {
    let key;
    switch (groupBy) {
      case 'month': key = t.date.substring(0, 7); break;
      case 'week': {
        const d = new Date(t.date + 'T12:00:00');
        const oneJan = new Date(d.getFullYear(), 0, 1);
        const wk = Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
        break;
      }
      case 'day': key = t.date; break;
      case 'category': key = catMap[Number(t.category_id)]?.name || 'Other'; break;
      default: key = t.date.substring(0, 7);
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(t.amount);
  });

  const sortedKeys = Object.keys(groups).sort();
  const values = sortedKeys.map(k => {
    const arr = groups[k];
    switch (metric) {
      case 'sum': return arr.reduce((s, v) => s + v, 0);
      case 'avg': return arr.reduce((s, v) => s + v, 0) / arr.length;
      case 'count': return arr.length;
      case 'max': return Math.max(...arr);
      case 'min': return Math.min(...arr);
      default: return arr.reduce((s, v) => s + v, 0);
    }
  });

  const ctx = document.getElementById('aggregateChart').getContext('2d');
  if (aggregateChart) aggregateChart.destroy();

  const chartType = groupBy === 'category' ? 'bar' : 'line';
  const color = type === 'income' ? '#10B981' : type === 'expense' ? '#FF6B9D' : '#6C5CE7';

  aggregateChart = new Chart(ctx, {
    type: chartType,
    data: {
      labels: sortedKeys,
      datasets: [{
        label: `${metric} (${type || 'all'})`,
        data: values,
        backgroundColor: chartType === 'bar' ? color : color + '20',
        borderColor: color,
        borderWidth: 2,
        borderRadius: chartType === 'bar' ? 6 : 0,
        fill: chartType === 'line',
        tension: 0.4,
        pointRadius: chartType === 'line' ? 3 : 0,
        pointBackgroundColor: color
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: c => metric === 'count' ? ` Count: ${c.raw}` : ` ${fmt(c.raw)}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor(), font: { size: 10 }, maxRotation: 45 } },
        y: {
          grid: { color: chartGridColor() },
          ticks: {
            color: chartTextColor(), font: { size: 10 },
            callback: v => metric === 'count' ? v : (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v)
          },
          border: { display: false }
        }
      }
    }
  });
}

// ── CSV Import ───────────────────────────────────────────
function openImportModal() {
  document.getElementById('importModal').classList.remove('hidden');
  document.getElementById('importModal').classList.add('flex');
  document.getElementById('importResult').classList.add('hidden');
}

function closeImportModal() {
  document.getElementById('importModal').classList.add('hidden');
  document.getElementById('importModal').classList.remove('flex');
  document.getElementById('csvFile').value = '';
  document.getElementById('fileName').classList.add('hidden');
}

function handleFileSelect(input) {
  if (input.files.length) {
    const fn = document.getElementById('fileName');
    fn.textContent = input.files[0].name;
    fn.classList.remove('hidden');
  }
}

async function uploadCSV() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return showImportResult('CSV must have header + data rows', false);

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['type', 'amount', 'date'];
  const missing = required.filter(f => !headers.includes(f));
  if (missing.length) return showImportResult(`Missing columns: ${missing.join(', ')}`, false);

  const cats = await dbGetAll('categories');
  const catNameMap = {};
  cats.forEach(c => { catNameMap[c.name.toLowerCase()] = c.id; });

  let imported = 0;
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

    if (!row.type || !row.amount || !row.date) continue;
    if (!['income', 'expense'].includes(row.type.toLowerCase())) continue;

    await dbAdd('transactions', {
      type: row.type.toLowerCase(),
      amount: parseFloat(row.amount),
      category_id: row.category ? (catNameMap[row.category.toLowerCase()] || null) : null,
      merchant: row.merchant || '',
      description: row.description || '',
      date: row.date
    });
    imported++;
  }

  showImportResult(`Successfully imported ${imported} of ${lines.length - 1} rows`, true);
  reloadAll();
}

function showImportResult(msg, success) {
  const el = document.getElementById('importResult');
  el.classList.remove('hidden');
  el.textContent = msg;
  el.className = `mt-4 text-sm p-3 rounded-xl ${success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`;
}

// ── Search ───────────────────────────────────────────────
function initSearch() {
  let timer;
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => loadTransactions(e.target.value), 300);
  });
}

// ── Reload All ───────────────────────────────────────────
function reloadAll() {
  loadSummary();
  loadAccounts();
  loadCategories();
  loadDissection();
  loadSpending();
  loadTransactions();
  loadInvestments();
  loadWeekly();
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  initTheme();
  await seedDatabase();
  reloadAll();
  initSearch();
  loadAggregate();
}

init();

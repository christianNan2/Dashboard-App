// DataViz – Universal Data Visualization Tool

const DB_NAME = 'DataVizDB';
const DB_VERSION = 1;
let dbInstance = null;

let currentData = { id: null, name: '', headers: [], rows: [] };
let mainChart = null;
let autoSaveTimer = null;

const chartColors = ['#6C5CE7','#FF6B9D','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16'];

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ── IndexedDB ────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('datasets')) {
        const ds = db.createObjectStore('datasets', { keyPath: 'id', autoIncrement: true });
        ds.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('views')) {
        const vs = db.createObjectStore('views', { keyPath: 'id', autoIncrement: true });
        vs.createIndex('createdAt', 'createdAt');
        vs.createIndex('datasetId', 'datasetId');
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

function dbGet(store, key) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
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

function dbDelete(store, key) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function saveLastDatasetId(id) {
  await dbPut('meta', { key: 'lastDatasetId', value: id });
}

async function saveLastViewId(id) {
  await dbPut('meta', { key: 'lastViewId', value: id });
}

async function getLastDatasetId() {
  const row = await dbGet('meta', 'lastDatasetId');
  return row ? row.value : null;
}

// ── Theme ────────────────────────────────────────────────
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark() ? 'dark' : 'light');
  updateChart();
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
}

function isDark() { return document.documentElement.classList.contains('dark'); }
function chartTextColor() { return isDark() ? '#94a3b8' : '#64748b'; }
function chartGridColor() { return isDark() ? 'rgba(148,163,184,0.08)' : 'rgba(0,0,0,0.05)'; }

// ── Import Modal ─────────────────────────────────────────
function openImportModal() {
  document.getElementById('importModal').classList.remove('hidden');
  document.getElementById('importModal').classList.add('flex');
  document.getElementById('importStep1').classList.remove('hidden');
  document.getElementById('importStep2').classList.add('hidden');
  document.getElementById('importResult').classList.add('hidden');
}

function closeImportModal() {
  document.getElementById('importModal').classList.add('hidden');
  document.getElementById('importModal').classList.remove('flex');
  const f = document.getElementById('csvFile');
  if (f) f.value = '';
  const fn = document.getElementById('fileName');
  if (fn) fn.classList.add('hidden');
}

function handleFileSelect(input) {
  if (input.files.length) {
    const fn = document.getElementById('fileName');
    fn.textContent = '✓ ' + input.files[0].name;
    fn.classList.remove('hidden');
  }
}

function backToStep1() {
  document.getElementById('importStep1').classList.remove('hidden');
  document.getElementById('importStep2').classList.add('hidden');
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';' || ch === '\t') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function detectColumnTypes(headers, rows) {
  return headers.map((_, ci) => {
    let numericCount = 0;
    let dateCount = 0;
    let total = 0;
    for (const row of rows.slice(0, 100)) {
      const value = row[ci];
      if (value === undefined || value === null || value === '') continue;
      total++;
      if (!isNaN(Number(value))) numericCount++;
      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(value))) dateCount++;
    }
    if (!total) return 'text';
    if (numericCount / total > 0.7) return 'number';
    if (dateCount / total > 0.7) return 'date';
    return 'text';
  });
}

async function parseUploadedFile() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) return showImportResult('Please select a file first', false);

  const text = await file.text();
  let parsed = { headers: [], rows: [] };

  if (file.name.toLowerCase().endsWith('.json')) {
    try {
      let json = JSON.parse(text);
      if (!Array.isArray(json)) {
        const arrKey = Object.keys(json).find((k) => Array.isArray(json[k]));
        json = arrKey ? json[arrKey] : [json];
      }
      if (!json.length) return showImportResult('JSON contains no data', false);
      parsed.headers = Object.keys(json[0]);
      parsed.rows = json.map((row) => parsed.headers.map((h) => row[h] ?? ''));
    } catch (err) {
      return showImportResult('Invalid JSON: ' + err.message, false);
    }
  } else {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return showImportResult('Need header + at least one data row', false);
    parsed.headers = parseCSVLine(lines[0]);
    parsed.rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length) parsed.rows.push(values);
    }
  }

  if (!parsed.rows.length || !parsed.headers.length) return showImportResult('No usable rows found', false);

  const colTypes = detectColumnTypes(parsed.headers, parsed.rows);

  const table = document.getElementById('previewTable');
  table.innerHTML = `<thead><tr class="bg-surface-light dark:bg-surface-dark">${parsed.headers.map((h, i) => `<th class="px-3 py-2 text-left font-medium whitespace-nowrap">${h} <span class="text-[9px] ml-1 px-1 py-0.5 rounded ${colTypes[i] === 'number' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600' : colTypes[i] === 'date' ? 'bg-green-100 dark:bg-green-900/40 text-green-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}">${colTypes[i]}</span></th>`).join('')}</tr></thead><tbody>${parsed.rows.slice(0, 6).map((r) => `<tr class="border-t border-gray-100 dark:border-gray-800">${parsed.headers.map((_, idx) => `<td class="px-3 py-1.5 whitespace-nowrap">${String(r[idx] ?? '').substring(0, 40)}</td>`).join('')}</tr>`).join('')}</tbody>`;

  document.getElementById('importRowCount').textContent = `${parsed.rows.length} rows × ${parsed.headers.length} columns`;

  const labelSel = document.getElementById('importColLabel');
  const valuesSel = document.getElementById('importColValues');
  labelSel.innerHTML = parsed.headers.map((h, i) => `<option value="${i}">${h}</option>`).join('');
  valuesSel.innerHTML = parsed.headers.map((h, i) => `<option value="${i}">${h} (${colTypes[i]})</option>`).join('');

  const firstText = colTypes.findIndex((t) => t !== 'number');
  if (firstText >= 0) labelSel.value = String(firstText);
  Array.from(valuesSel.options).forEach((opt) => {
    opt.selected = colTypes[Number(opt.value)] === 'number';
  });

  currentData = {
    id: null,
    name: file.name,
    headers: parsed.headers,
    rows: parsed.rows
  };

  document.getElementById('importStep1').classList.add('hidden');
  document.getElementById('importStep2').classList.remove('hidden');
  document.getElementById('importResult').classList.add('hidden');
}

async function importData() {
  const labelIdx = Number(document.getElementById('importColLabel').value);
  const selectedIdxs = Array.from(document.getElementById('importColValues').selectedOptions).map((o) => Number(o.value));

  if (!selectedIdxs.length) return showImportResult('Select at least one value column', false);

  const payload = {
    name: currentData.name || 'Imported dataset',
    headers: currentData.headers,
    rows: currentData.rows,
    createdAt: new Date().toISOString()
  };

  const datasetId = await dbAdd('datasets', payload);
  currentData.id = datasetId;
  await saveLastDatasetId(datasetId);

  showData();
  populateControls();

  // Apply modal defaults to visualization controls.
  document.getElementById('vizLabel').value = String(labelIdx);
  const vizValues = document.getElementById('vizValues');
  Array.from(vizValues.options).forEach((opt) => {
    opt.selected = selectedIdxs.includes(Number(opt.value));
  });

  updateChart();
  closeImportModal();
  showImportResult('Dataset imported and saved in browser DB.', true);
  await loadDatasets();
  await loadHistory();
}

function showImportResult(msg, success) {
  const el = document.getElementById('importResult');
  el.classList.remove('hidden');
  el.textContent = msg;
  el.className = `mt-4 text-sm p-3 rounded-xl ${success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`;
}

// ── Data Rendering ───────────────────────────────────────
function showData() {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('dataLoadedState').classList.remove('hidden');
  renderDataTable();
}

function renderDataTable() {
  const thead = document.querySelector('#dataTable thead');
  const tbody = document.querySelector('#dataTable tbody');
  thead.innerHTML = `<tr>${currentData.headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  tbody.innerHTML = currentData.rows.slice(0, 30).map((row) => `<tr>${currentData.headers.map((_, idx) => `<td>${String(row[idx] ?? '').substring(0, 60)}</td>`).join('')}</tr>`).join('');
  document.getElementById('rowCount').textContent = `${currentData.rows.length} rows`;
}

function populateControls() {
  const labelSel = document.getElementById('vizLabel');
  const valuesSel = document.getElementById('vizValues');
  const groupSel = document.getElementById('vizGroupBy');

  labelSel.innerHTML = currentData.headers.map((h, i) => `<option value="${i}">${h}</option>`).join('');
  valuesSel.innerHTML = currentData.headers.map((h, i) => `<option value="${i}">${h}</option>`).join('');

  const types = detectColumnTypes(currentData.headers, currentData.rows);
  const firstText = types.findIndex((t) => t !== 'number');
  if (firstText >= 0) labelSel.value = String(firstText);

  Array.from(valuesSel.options).forEach((opt) => {
    opt.selected = types[Number(opt.value)] === 'number';
  });

  groupSel.innerHTML = `<option value="none">None</option>${currentData.headers.map((h, i) => `<option value="${i}">${h}</option>`).join('')}`;
}

function aggregateValues(values, agg) {
  if (!values.length) return 0;
  switch (agg) {
    case 'sum': return values.reduce((s, v) => s + v, 0);
    case 'avg': return values.reduce((s, v) => s + v, 0) / values.length;
    case 'count': return values.length;
    case 'max': return Math.max(...values);
    case 'min': return Math.min(...values);
    default: return values[0];
  }
}

function buildSeries(labelIdx, valueIdxs, groupByIdx, aggType) {
  const normalizedAgg = aggType === 'none' ? 'sum' : aggType;

  if (groupByIdx === null && aggType === 'none') {
    const labels = currentData.rows.map((r) => String(r[labelIdx] ?? ''));
    const datasets = valueIdxs.map((vi) => ({
      label: currentData.headers[vi],
      data: currentData.rows.map((r) => {
        const n = Number(r[vi]);
        return Number.isFinite(n) ? n : 0;
      })
    }));
    return { labels, datasets };
  }

  const grouped = new Map();
  for (const row of currentData.rows) {
    const keySource = groupByIdx === null ? row[labelIdx] : row[groupByIdx];
    const key = String(keySource ?? 'N/A');
    if (!grouped.has(key)) {
      grouped.set(key, valueIdxs.map(() => []));
    }
    const bucket = grouped.get(key);
    valueIdxs.forEach((vi, pos) => {
      const n = Number(row[vi]);
      if (Number.isFinite(n)) bucket[pos].push(n);
    });
  }

  const labels = Array.from(grouped.keys());
  const datasets = valueIdxs.map((vi, pos) => ({
    label: currentData.headers[vi],
    data: labels.map((k) => aggregateValues(grouped.get(k)[pos], normalizedAgg))
  }));

  return { labels, datasets };
}

// ── Chart Rendering ──────────────────────────────────────
function updateChart() {
  if (!currentData.headers.length) return;

  const labelIdx = Number(document.getElementById('vizLabel').value);
  const valueIdxs = Array.from(document.getElementById('vizValues').selectedOptions).map((o) => Number(o.value));
  const chartType = document.getElementById('chartType').value;
  const groupByRaw = document.getElementById('vizGroupBy').value;
  const aggType = document.getElementById('vizAggType').value;

  if (!valueIdxs.length) {
    if (mainChart) mainChart.destroy();
    mainChart = null;
    return;
  }

  const groupByIdx = groupByRaw === 'none' ? null : Number(groupByRaw);
  const { labels, datasets } = buildSeries(labelIdx, valueIdxs, groupByIdx, aggType);
  renderChart(chartType, labels, datasets);
  scheduleAutoSaveView();
}

function scheduleAutoSaveView() {
  if (!currentData.id) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveAutoView().catch(() => {});
  }, 600);
}

async function saveAutoView() {
  if (!currentData.id || !currentData.headers.length) return;

  const valueIdxs = Array.from(document.getElementById('vizValues').selectedOptions).map((o) => Number(o.value));
  if (!valueIdxs.length) return;

  const payload = {
    name: `Auto: ${currentData.name || 'Dataset'}`,
    datasetId: currentData.id,
    chartType: document.getElementById('chartType').value,
    labelIdx: Number(document.getElementById('vizLabel').value),
    valueIdxs,
    groupBy: document.getElementById('vizGroupBy').value,
    aggType: document.getElementById('vizAggType').value,
    isAuto: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const views = await dbGetAll('views');
  const existing = views.find((v) => v.isAuto && v.datasetId === currentData.id);
  if (existing) {
    payload.id = existing.id;
    payload.createdAt = existing.createdAt;
    await dbPut('views', payload);
    await saveLastViewId(existing.id);
  } else {
    const id = await dbAdd('views', payload);
    await saveLastViewId(id);
  }
  await loadHistory();
}

function renderChart(chartType, labels, datasets) {
  const canvas = document.getElementById('mainChart');
  const ctx = canvas.getContext('2d');
  if (mainChart) mainChart.destroy();

  const isPie = chartType === 'doughnut' || chartType === 'polarArea';
  const isScatter = chartType === 'scatter';

  let config;

  if (isPie) {
    // For pie-like charts with multiple values selected, convert series into category slices.
    const pieLabels = datasets.length > 1 ? datasets.map((d) => d.label) : labels;
    const pieValues = datasets.length > 1
      ? datasets.map((d) => d.data.reduce((s, v) => s + v, 0))
      : datasets[0].data;

    config = {
      type: chartType,
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieValues,
          backgroundColor: pieLabels.map((_, i) => chartColors[i % chartColors.length]),
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 10,
              padding: 8,
              font: { size: 10 },
              color: chartTextColor(),
              usePointStyle: true,
              pointStyle: 'circle'
            }
          }
        }
      }
    };
  } else if (isScatter) {
    config = {
      type: 'scatter',
      data: {
        datasets: datasets.map((ds, i) => ({
          label: ds.label,
          data: ds.data.map((value, x) => ({ x, y: value })),
          backgroundColor: chartColors[i % chartColors.length],
          pointRadius: 4
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: chartTextColor() } },
          y: { grid: { color: chartGridColor() }, ticks: { color: chartTextColor() }, border: { display: false } }
        }
      }
    };
  } else {
    config = {
      type: chartType,
      data: {
        labels,
        datasets: datasets.map((ds, i) => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: chartType === 'bar' ? chartColors[i % chartColors.length] : `${chartColors[i % chartColors.length]}22`,
          borderColor: chartColors[i % chartColors.length],
          borderWidth: 2,
          borderRadius: chartType === 'bar' ? 6 : 0,
          fill: chartType === 'line',
          tension: 0.35,
          pointRadius: chartType === 'line' ? 3 : 0,
          pointBackgroundColor: chartColors[i % chartColors.length],
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: chartTextColor(), font: { size: 11 } } } },
        scales: chartType === 'radar'
          ? {
              r: {
                ticks: { color: chartTextColor(), backdropColor: 'transparent' },
                grid: { color: chartGridColor() },
                pointLabels: { color: chartTextColor() }
              }
            }
          : {
              x: { grid: { display: false }, ticks: { color: chartTextColor(), font: { size: 10 }, maxRotation: 45 } },
              y: { grid: { color: chartGridColor() }, ticks: { color: chartTextColor(), font: { size: 10 } }, border: { display: false } }
            }
      }
    };
  }

  mainChart = new Chart(ctx, config);
}

// ── View History ─────────────────────────────────────────
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function saveCurrentView() {
  if (!currentData.id || !currentData.headers.length) {
    alert('Import data first, then save a view.');
    return;
  }

  const viewName = prompt('Name for this view:', `${currentData.name} View`) || '';
  if (!viewName.trim()) return;

  const payload = {
    name: viewName.trim(),
    datasetId: currentData.id,
    chartType: document.getElementById('chartType').value,
    labelIdx: Number(document.getElementById('vizLabel').value),
    valueIdxs: Array.from(document.getElementById('vizValues').selectedOptions).map((o) => Number(o.value)),
    groupBy: document.getElementById('vizGroupBy').value,
    aggType: document.getElementById('vizAggType').value,
    isAuto: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!payload.valueIdxs.length) {
    alert('Select at least one value column before saving.');
    return;
  }

  const id = await dbAdd('views', payload);
  await saveLastViewId(id);
  await loadHistory();
}

// ── Dataset Manager ──────────────────────────────────────
async function loadDatasets() {
  const list = document.getElementById('datasetList');
  const datasets = await dbGetAll('datasets');
  if (!datasets.length) {
    list.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400">No datasets yet.</p>';
    return;
  }

  const sorted = datasets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  list.innerHTML = sorted.map((ds) => `
    <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-gray-800">
      <div class="min-w-0">
        <div class="text-sm font-medium truncate">${safeText(ds.name || 'Dataset')}</div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">${ds.rows.length} rows • ${ds.headers.length} columns • ${formatDate(ds.createdAt)}</div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button onclick="openDataset(${ds.id})" class="text-xs px-2 py-1 rounded bg-brand text-white hover:bg-brand/90">Open</button>
        <button onclick="deleteDataset(${ds.id})" class="text-xs px-2 py-1 rounded border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
      </div>
    </div>`).join('');
}

async function openDataset(datasetId) {
  const ds = await dbGet('datasets', datasetId);
  if (!ds) return;
  currentData = {
    id: ds.id,
    name: ds.name,
    headers: ds.headers,
    rows: ds.rows
  };
  await saveLastDatasetId(ds.id);
  showData();
  populateControls();
  updateChart();
}

async function deleteDataset(datasetId) {
  if (!confirm('Delete this dataset and related saved views?')) return;
  await dbDelete('datasets', datasetId);
  const views = await dbGetAll('views');
  const linked = views.filter((v) => v.datasetId === datasetId);
  for (const v of linked) {
    await dbDelete('views', v.id);
  }

  if (currentData.id === datasetId) {
    currentData = { id: null, name: '', headers: [], rows: [] };
    if (mainChart) mainChart.destroy();
    mainChart = null;
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('dataLoadedState').classList.add('hidden');
  }

  await loadDatasets();
  await loadHistory();
}

async function loadHistory() {
  const views = await dbGetAll('views');
  const datasets = await dbGetAll('datasets');
  const datasetMap = Object.fromEntries(datasets.map((d) => [d.id, d]));
  const list = document.getElementById('historyList');

  if (!views.length) {
    list.innerHTML = '<p class="text-xs text-gray-500 dark:text-gray-400">No saved views yet.</p>';
    return;
  }

  const sorted = views.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  list.innerHTML = sorted.map((v) => {
    const ds = datasetMap[v.datasetId];
    const dsName = ds ? ds.name : 'Dataset deleted';
    return `
      <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-gray-800">
        <div class="min-w-0">
          <div class="text-sm font-medium truncate">${safeText(v.name)} ${v.isAuto ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">AUTO</span>' : ''}</div>
          <div class="text-[11px] text-gray-500 dark:text-gray-400 truncate">${safeText(dsName)} • ${safeText(v.chartType)} • ${formatDate(v.updatedAt || v.createdAt)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="openView(${v.id})" class="text-xs px-2 py-1 rounded bg-brand text-white hover:bg-brand/90">Open</button>
          <button onclick="deleteView(${v.id})" class="text-xs px-2 py-1 rounded border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
        </div>
      </div>`;
  }).join('');
}

async function openView(viewId) {
  const view = await dbGet('views', viewId);
  if (!view) return;

  const dataset = await dbGet('datasets', view.datasetId);
  if (!dataset) {
    alert('Dataset not found for this view.');
    return;
  }

  currentData = {
    id: dataset.id,
    name: dataset.name,
    headers: dataset.headers,
    rows: dataset.rows
  };

  await saveLastDatasetId(dataset.id);
  showData();
  populateControls();

  document.getElementById('chartType').value = view.chartType;
  document.getElementById('vizLabel').value = String(view.labelIdx);
  document.getElementById('vizGroupBy').value = view.groupBy;
  document.getElementById('vizAggType').value = view.aggType;

  const valuesSel = document.getElementById('vizValues');
  Array.from(valuesSel.options).forEach((opt) => {
    opt.selected = view.valueIdxs.includes(Number(opt.value));
  });

  await saveLastViewId(view.id);
  updateChart();
}

async function deleteView(viewId) {
  if (!confirm('Delete this saved view?')) return;
  await dbDelete('views', viewId);
  await loadHistory();
}

// ── Backup ───────────────────────────────────────────────
async function exportBackup() {
  const datasets = await dbGetAll('datasets');
  const views = await dbGetAll('views');
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    datasets,
    views
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dataviz-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importBackupFile(input) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    const datasets = Array.isArray(backup.datasets) ? backup.datasets : [];
    const views = Array.isArray(backup.views) ? backup.views : [];

    const idMap = new Map();
    for (const ds of datasets) {
      const toSave = {
        name: ds.name || 'Imported dataset',
        headers: Array.isArray(ds.headers) ? ds.headers : [],
        rows: Array.isArray(ds.rows) ? ds.rows : [],
        createdAt: ds.createdAt || new Date().toISOString()
      };
      const newId = await dbAdd('datasets', toSave);
      idMap.set(ds.id, newId);
    }

    for (const v of views) {
      const mappedDatasetId = idMap.get(v.datasetId);
      if (!mappedDatasetId) continue;
      await dbAdd('views', {
        name: v.name || 'Imported view',
        datasetId: mappedDatasetId,
        chartType: v.chartType || 'bar',
        labelIdx: Number.isInteger(v.labelIdx) ? v.labelIdx : 0,
        valueIdxs: Array.isArray(v.valueIdxs) ? v.valueIdxs : [],
        groupBy: v.groupBy || 'none',
        aggType: v.aggType || 'none',
        isAuto: Boolean(v.isAuto),
        createdAt: v.createdAt || new Date().toISOString(),
        updatedAt: v.updatedAt || new Date().toISOString()
      });
    }

    await loadDatasets();
    await loadHistory();
    alert('Backup imported successfully.');
  } catch (err) {
    alert('Backup import failed: ' + err.message);
  } finally {
    input.value = '';
  }
}

// ── Reset ────────────────────────────────────────────────
async function resetData() {
  if (!confirm('Clear currently loaded data from screen? Saved history stays in DB.')) return;
  currentData = { id: null, name: '', headers: [], rows: [] };
  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('dataLoadedState').classList.add('hidden');
  if (mainChart) mainChart.destroy();
  mainChart = null;
}

async function loadLastDataset() {
  const lastId = await getLastDatasetId();
  if (!lastId) return;
  const ds = await dbGet('datasets', lastId);
  if (!ds) return;

  currentData = {
    id: ds.id,
    name: ds.name,
    headers: ds.headers,
    rows: ds.rows
  };

  showData();
  populateControls();
  updateChart();
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  initTheme();
  await openDB();
  await loadDatasets();
  await loadHistory();
  await loadLastDataset();
}

init();

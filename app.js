// ══════════════════════════════════════════════════════════
// DataViz – Universal Data Visualization Tool
// ══════════════════════════════════════════════════════════

let currentData = { headers: [], rows: [] };
let mainChart = null;
const chartColors = ['#6C5CE7','#FF6B9D','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16'];

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

// ── Import Functions ─────────────────────────────────────
function openImportModal() {
  document.getElementById('importModal').classList.remove('hidden');
  document.getElementById('importModal').classList.add('flex');
  document.getElementById('importStep1').classList.remove('hidden');
  document.getElementById('importStep2').classList.add('hidden');
  document.getElementById('importResult').classList.add('hidden');
  currentData = { headers: [], rows: [] };
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

async function parseUploadedFile() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) return showImportResult('Please select a file first', false);

  const text = await file.text();
  if (file.name.endsWith('.json')) {
    try {
      let json = JSON.parse(text);
      if (!Array.isArray(json)) {
        const k = Object.keys(json).find(k => Array.isArray(json[k]));
        json = k ? json[k] : [json];
      }
      if (!json.length) return showImportResult('JSON contains no data', false);
      currentData.headers = Object.keys(json[0]);
      currentData.rows = json.map(r => currentData.headers.map(h => r[h] ?? ''));
    } catch (e) {
      return showImportResult('Invalid JSON: ' + e.message, false);
    }
  } else {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return showImportResult('Need header + data rows', false);
    currentData.headers = parseCSVLine(lines[0]);
    currentData.rows = [];
    for (let i = 1; i < lines.length; i++) {
      const v = parseCSVLine(lines[i]);
      if (v.length >= currentData.headers.length / 2) currentData.rows.push(v);
    }
  }

  if (!currentData.rows.length) return showImportResult('No data rows found', false);

  // Auto-detect column types
  const colTypes = currentData.headers.map((_, ci) => {
    let nc = 0, dc = 0, tot = 0;
    for (const row of currentData.rows.slice(0, 50)) {
      const v = row[ci];
      if (v === undefined || v === '') continue;
      tot++;
      if (!isNaN(Number(v))) nc++;
      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(v)) dc++;
    }
    if (!tot) return 'text';
    if (nc / tot > 0.7) return 'number';
    if (dc / tot > 0.7) return 'date';
    return 'text';
  });

  // Show preview
  const table = document.getElementById('previewTable');
  table.innerHTML = `<thead><tr class="bg-surface-light dark:bg-surface-dark">${currentData.headers.map((h,i)=>`<th class="px-3 py-2 text-left font-medium whitespace-nowrap">${h} <span class="text-[9px] ml-1 px-1 py-0.5 rounded ${colTypes[i]==='number'?'bg-blue-100 dark:bg-blue-900/40 text-blue-600':colTypes[i]==='date'?'bg-green-100 dark:bg-green-900/40 text-green-600':'bg-gray-100 dark:bg-gray-800 text-gray-500'}">${colTypes[i]}</span></th>`).join('')}</tr></thead><tbody>${currentData.rows.slice(0,5).map(r=>`<tr class="border-t border-gray-100 dark:border-gray-800">${r.map(v=>`<td class="px-3 py-1.5 whitespace-nowrap">${String(v).substring(0,30)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  document.getElementById('importRowCount').textContent = `${currentData.rows.length} rows × ${currentData.headers.length} columns`;

  const labelSel = document.getElementById('colLabel');
  const valuesSel = document.getElementById('colValues');
  labelSel.innerHTML = currentData.headers.map((h,i)=>`<option value="${i}">${h}</option>`).join('');
  valuesSel.innerHTML = currentData.headers.map((h,i)=>`<option value="${i}">${h} (${colTypes[i]})</option>`).join('');

  const firstText = colTypes.findIndex(t => t !== 'number');
  if (firstText >= 0) labelSel.value = firstText;
  for (const opt of valuesSel.options) opt.selected = colTypes[parseInt(opt.value)] === 'number';

  document.getElementById('importStep1').classList.add('hidden');
  document.getElementById('importStep2').classList.remove('hidden');
  document.getElementById('importResult').classList.add('hidden');
}

function importData() {
  const labelIdx = parseInt(document.getElementById('colLabel').value);
  const selectedIdxs = Array.from(document.getElementById('colValues').selectedOptions).map(o => parseInt(o.value));

  if (!selectedIdxs.length) return showImportResult('Select at least one value column', false);

  showData();
  populateControls();
  updateChart();
  closeImportModal();
  showImportResult(`Imported ${currentData.rows.length} rows successfully!`, true);
}

function showImportResult(msg, success) {
  const el = document.getElementById('importResult');
  el.classList.remove('hidden');
  el.textContent = msg;
  el.className = `mt-4 text-sm p-3 rounded-xl ${success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`;
}

// ── Show Data ────────────────────────────────────────────
function showData() {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('dataLoadedState').classList.remove('hidden');
  renderDataTable();
}

function renderDataTable() {
  const thead = document.querySelector('#dataTable thead');
  const tbody = document.querySelector('#dataTable tbody');
  thead.innerHTML = `<tr>${currentData.headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  tbody.innerHTML = currentData.rows.slice(0, 20).map(r => `<tr>${r.map(v => `<td>${String(v).substring(0, 50)}</td>`).join('')}</tr>`).join('');
  document.getElementById('rowCount').textContent = `${currentData.rows.length} rows`;
}

function populateControls() {
  const labelSel = document.getElementById('colLabel');
  const valuesSel = document.getElementById('colValues');
  labelSel.innerHTML = currentData.headers.map((h,i)=>`<option value="${i}">${h}</option>`).join('');
  valuesSel.innerHTML = currentData.headers.map((h,i)=>`<option value="${i}">${h}</option>`).join('');

  // Auto-select first text as label, first number as value
  const colTypes = currentData.headers.map((_, ci) => {
    let nc = 0, tot = 0;
    for (const row of currentData.rows.slice(0, 50)) {
      const v = row[ci];
      if (v === undefined || v === '') continue;
      tot++;
      if (!isNaN(Number(v))) nc++;
    }
    return tot > 0 && nc / tot > 0.7 ? 'number' : 'text';
  });

  const firstText = colTypes.findIndex(t => t === 'text');
  if (firstText >= 0) labelSel.value = firstText;
  for (const opt of valuesSel.options) opt.selected = colTypes[parseInt(opt.value)] === 'number';
}

// ── Chart Rendering ─────────────────────────────────────
function updateChart() {
  if (!currentData.headers.length) return;

  const labelIdx = parseInt(document.getElementById('colLabel').value);
  const selectedIdxs = Array.from(document.getElementById('colValues').selectedOptions).map(o => parseInt(o.value));
  const chartType = document.getElementById('chartType').value;

  if (!selectedIdxs.length) {
    if (mainChart) mainChart.destroy();
    mainChart = null;
    return;
  }

  const labels = currentData.rows.map(r => r[labelIdx] || '');
  const datasets = selectedIdxs.map((vi, si) => ({
    label: currentData.headers[vi],
    data: currentData.rows.map(r => {
      const v = parseFloat(r[vi]);
      return isNaN(v) ? 0 : v;
    })
  }));

  renderChart(chartType, labels, datasets);
}

function renderChart(chartType, labels, datasets) {
  const canvas = document.getElementById('mainChart');
  const ctx = canvas.getContext('2d');

  if (mainChart) mainChart.destroy();

  const isPie = ['doughnut', 'polarArea'].includes(chartType);
  const isScatter = chartType === 'scatter';

  let config;

  if (isPie) {
    config = {
      type: chartType,
      data: {
        labels: labels,
        datasets: [{
          data: datasets[0].data,
          backgroundColor: labels.map((_, i) => chartColors[i % chartColors.length]),
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
          },
          tooltip: {
            callbacks: {
              label: (c) => {
                const total = c.dataset.data.reduce((s, v) => s + v, 0);
                const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0;
                return ` ${pct}%`;
              }
            }
          }
        }
      }
    };
  } else if (isScatter) {
    config = {
      type: 'scatter',
      data: {
        datasets: datasets.map((s, si) => ({
          label: s.label,
          data: s.data.map((v, i) => ({ x: i, y: v })),
          backgroundColor: chartColors[si % chartColors.length],
          pointRadius: 4
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: chartTextColor() }
          },
          y: {
            grid: { color: chartGridColor() },
            ticks: { color: chartTextColor() },
            border: { display: false }
          }
        }
      }
    };
  } else {
    config = {
      type: chartType,
      data: {
        labels: labels,
        datasets: datasets.map((s, si) => ({
          label: s.label,
          data: s.data,
          backgroundColor: chartType === 'bar' ? chartColors[si % chartColors.length] : chartColors[si % chartColors.length] + '20',
          borderColor: chartColors[si % chartColors.length],
          borderWidth: 2,
          borderRadius: chartType === 'bar' ? 6 : 0,
          fill: chartType === 'line',
          tension: 0.4,
          pointRadius: chartType === 'line' ? 3 : 0,
          pointBackgroundColor: chartColors[si % chartColors.length],
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: chartTextColor(), font: { size: 11 } }
          }
        },
        scales: chartType === 'radar' ? {
          r: {
            ticks: { color: chartTextColor(), backdropColor: 'transparent' },
            grid: { color: chartGridColor() },
            pointLabels: { color: chartTextColor() }
          }
        } : {
          x: {
            grid: { display: false },
            ticks: { color: chartTextColor(), font: { size: 10 }, maxRotation: 45 }
          },
          y: {
            grid: { color: chartGridColor() },
            ticks: { color: chartTextColor(), font: { size: 10 } },
            border: { display: false }
          }
        }
      }
    };
  }

  mainChart = new Chart(ctx, config);
}

// ── Reset ────────────────────────────────────────────────
function resetData() {
  if (!confirm('Clear all data?')) return;
  currentData = { headers: [], rows: [] };
  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('dataLoadedState').classList.add('hidden');
  if (mainChart) mainChart.destroy();
  mainChart = null;
}

// ── Init ─────────────────────────────────────────────────
function init() {
  initTheme();
}

init();

const express = require('express');
const path = require('path');
const multer = require('multer');
const { db, initializeDatabase, seedData } = require('./database');

const app = express();
const PORT = 3000;
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB
initializeDatabase();
seedData();

// ── User ──
app.get('/api/user', (req, res) => {
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  const totalBalance = db.prepare(`SELECT COALESCE(SUM(balance),0) as total FROM accounts WHERE user_id = ?`).get(user.id);
  user.totalBalance = totalBalance.total;
  res.json(user);
});

// ── Summary Cards ──
app.get('/api/summary', (req, res) => {
  const userId = 1;
  const { month, year } = req.query;
  const currentMonth = month || new Date().toISOString().slice(0, 7);
  const prevDate = new Date(currentMonth + '-01');
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);

  const totalBalance = db.prepare('SELECT COALESCE(SUM(balance),0) as total FROM accounts WHERE user_id = ?').get(userId).total;

  const currentExpenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM transactions 
    WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?
  `).get(userId, currentMonth).total;

  const prevExpenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM transactions 
    WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?
  `).get(userId, prevMonth).total;

  const currentIncome = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM transactions 
    WHERE user_id = ? AND type = 'income' AND strftime('%Y-%m', date) = ?
  `).get(userId, currentMonth).total;

  const prevIncome = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM transactions 
    WHERE user_id = ? AND type = 'income' AND strftime('%Y-%m', date) = ?
  `).get(userId, prevMonth).total;

  const expenseChange = prevExpenses > 0 ? ((currentExpenses - prevExpenses) / prevExpenses * 100) : 0;
  const incomeChange = prevIncome > 0 ? ((currentIncome - prevIncome) / prevIncome * 100) : 0;

  res.json({
    totalBalance,
    totalExpenses: currentExpenses,
    totalIncome: currentIncome,
    expenseChange: Math.round(expenseChange * 100) / 100,
    incomeChange: Math.round(incomeChange * 100) / 100
  });
});

// ── Accounts / Cards ──
app.get('/api/accounts', (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = 1').all();
  res.json(accounts);
});

// ── Categories breakdown ──
app.get('/api/categories', (req, res) => {
  const { period } = req.query;
  let dateFilter = '';
  if (period === 'month') dateFilter = `AND strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')`;
  else if (period === 'year') dateFilter = `AND strftime('%Y', t.date) = strftime('%Y', 'now')`;

  const data = db.prepare(`
    SELECT c.name, c.color, c.icon, COALESCE(SUM(t.amount),0) as total,
           COUNT(t.id) as tx_count
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id AND t.type = 'expense' ${dateFilter}
    GROUP BY c.id
    HAVING total > 0
    ORDER BY total DESC
  `).all();

  const grandTotal = data.reduce((s, d) => s + d.total, 0);
  const result = data.map(d => ({
    ...d,
    percentage: grandTotal > 0 ? Math.round(d.total / grandTotal * 100) : 0
  }));
  res.json(result);
});

// ── Monthly dissection (bar chart) ──
app.get('/api/dissection', (req, res) => {
  const { year } = req.query;
  const y = year || '2026';
  const data = db.prepare(`
    SELECT strftime('%m', date) as month,
           SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
           SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expenses
    FROM transactions WHERE user_id = 1 AND strftime('%Y', date) = ?
    GROUP BY strftime('%m', date)
    ORDER BY month
  `).all(y);
  res.json(data);
});

// ── Spending parameters (circular progress) ──
app.get('/api/spending', (req, res) => {
  const data = db.prepare(`
    SELECT c.name, c.color, COALESCE(SUM(t.amount),0) as total
    FROM categories c
    JOIN transactions t ON t.category_id = c.id AND t.type = 'expense'
    WHERE t.user_id = 1
    GROUP BY c.id ORDER BY total DESC LIMIT 6
  `).all();

  const maxVal = Math.max(...data.map(d => d.total));
  const result = data.map(d => ({
    ...d,
    percentage: Math.round(d.total / maxVal * 100)
  }));
  res.json(result);
});

// ── Recent transactions ──
app.get('/api/transactions', (req, res) => {
  const { limit, offset, type, category, from, to, search } = req.query;
  let where = ['t.user_id = 1'];
  const params = [];

  if (type) { where.push('t.type = ?'); params.push(type); }
  if (category) { where.push('c.name = ?'); params.push(category); }
  if (from) { where.push('t.date >= ?'); params.push(from); }
  if (to) { where.push('t.date <= ?'); params.push(to); }
  if (search) { where.push('(t.merchant LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const whereClause = where.join(' AND ');
  const l = parseInt(limit) || 10;
  const o = parseInt(offset) || 0;

  const total = db.prepare(`SELECT COUNT(*) as count FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE ${whereClause}`).get(...params).count;
  const data = db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE ${whereClause}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, l, o);

  res.json({ data, total, limit: l, offset: o });
});

// ── Investments ──
app.get('/api/investments', (req, res) => {
  const data = db.prepare('SELECT * FROM investments WHERE user_id = 1 ORDER BY amount DESC').all();
  res.json(data);
});

// ── Income & Expenses weekly chart ──
app.get('/api/weekly', (req, res) => {
  const data = db.prepare(`
    SELECT date,
           SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
           SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expenses
    FROM transactions
    WHERE user_id = 1 AND date >= date('now', '-6 days')
    GROUP BY date ORDER BY date
  `).all();
  res.json(data);
});

// ── CSV Import ──
app.post('/api/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fs = require('fs');
  const content = fs.readFileSync(req.file.path, 'utf-8');
  fs.unlinkSync(req.file.path);

  const lines = content.trim().split('\n');
  if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header + data rows' });

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const requiredFields = ['type', 'amount', 'date'];
  const missing = requiredFields.filter(f => !headers.includes(f));
  if (missing.length) return res.status(400).json({ error: `Missing columns: ${missing.join(', ')}` });

  const insert = db.prepare(`
    INSERT INTO transactions (user_id, category_id, type, amount, description, merchant, date)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `);

  const getCat = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)');

  let imported = 0;
  const importAll = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => row[h] = values[idx] || '');

      if (!row.type || !row.amount || !row.date) continue;
      if (!['income', 'expense'].includes(row.type.toLowerCase())) continue;

      const cat = row.category ? getCat.get(row.category) : null;
      insert.run(
        cat ? cat.id : null,
        row.type.toLowerCase(),
        parseFloat(row.amount),
        row.description || '',
        row.merchant || '',
        row.date
      );
      imported++;
    }
  });

  importAll();
  res.json({ imported, total: lines.length - 1 });
});

// ── Aggregation endpoint ──
app.get('/api/aggregate', (req, res) => {
  const { groupBy, metric, type, from, to } = req.query;
  const validGroups = { month: "strftime('%Y-%m', date)", week: "strftime('%Y-%W', date)", day: 'date', category: 'c.name' };
  const validMetrics = { sum: 'SUM(t.amount)', avg: 'AVG(t.amount)', count: 'COUNT(t.id)', max: 'MAX(t.amount)', min: 'MIN(t.amount)' };

  const groupExpr = validGroups[groupBy] || validGroups.month;
  const metricExpr = validMetrics[metric] || validMetrics.sum;

  let where = ['t.user_id = 1'];
  const params = [];
  if (type) { where.push('t.type = ?'); params.push(type); }
  if (from) { where.push('t.date >= ?'); params.push(from); }
  if (to) { where.push('t.date <= ?'); params.push(to); }

  const data = db.prepare(`
    SELECT ${groupExpr} as label, ${metricExpr} as value
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE ${where.join(' AND ')}
    GROUP BY label ORDER BY label
  `).all(...params);

  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});

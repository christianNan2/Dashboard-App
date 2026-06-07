const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'dashboard.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      bank TEXT,
      card_type TEXT,
      card_number TEXT,
      balance REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_id INTEGER,
      category_id INTEGER,
      type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      merchant TEXT,
      date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      amount REAL NOT NULL,
      returns REAL DEFAULT 0,
      date DATE NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
  `);
}

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) return;

  const insertUser = db.prepare('INSERT INTO users (name, email, avatar) VALUES (?, ?, ?)');
  const user = insertUser.run('Kristi Kamylova', 'kristi@develop.io', '/avatar.png');
  const userId = user.lastInsertRowid;

  const insertCategory = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
  const categories = [
    ['Food', '#FF6B6B', '🍔'],
    ['Housing', '#4ECDC4', '🏠'],
    ['Transport', '#45B7D1', '🚗'],
    ['Shopping', '#96CEB4', '🛍️'],
    ['Entertainment', '#FFEAA7', '🎬'],
    ['Health', '#DDA0DD', '💊'],
    ['Pantry', '#F0E68C', '🥫'],
    ['Holiday', '#87CEEB', '✈️'],
    ['Salary', '#98D8C8', '💰'],
    ['Freelance', '#F7DC6F', '💻'],
    ['Investment', '#BB8FCE', '📈'],
    ['Other', '#AEB6BF', '📦']
  ];
  const catIds = {};
  for (const [name, color, icon] of categories) {
    const r = insertCategory.run(name, color, icon);
    catIds[name] = r.lastInsertRowid;
  }

  const insertAccount = db.prepare('INSERT INTO accounts (user_id, name, bank, card_type, card_number, balance) VALUES (?, ?, ?, ?, ?, ?)');
  const acc1 = insertAccount.run(userId, 'Main Account', 'Priobank', 'mastercard', '4578', 657850);
  const acc2 = insertAccount.run(userId, 'Business', 'BCA Bank', 'visa', '4578', 200000);

  const insertTx = db.prepare('INSERT INTO transactions (user_id, account_id, category_id, type, amount, description, merchant, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertInv = db.prepare('INSERT INTO investments (user_id, name, category, amount, returns, date) VALUES (?, ?, ?, ?, ?, ?)');

  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
                   '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];

  const incomeBase = [52000, 48000, 65000, 58000, 71000, 63000, 45000, 55000, 60000, 67000, 72000, 80000];
  const expenseBase = [35000, 28000, 42000, 38000, 45000, 41000, 30000, 36000, 39000, 43000, 48000, 52000];

  const seedTx = db.transaction(() => {
    for (let m = 0; m < months.length; m++) {
      const month = months[m];
      const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();

      // Income transactions
      insertTx.run(userId, acc1.lastInsertRowid, catIds['Salary'], 'income', incomeBase[m] * 0.7, 'Monthly Salary', 'Employer', `${month}-01`);
      insertTx.run(userId, acc1.lastInsertRowid, catIds['Freelance'], 'income', incomeBase[m] * 0.2, 'Freelance Project', 'Client', `${month}-15`);
      insertTx.run(userId, acc1.lastInsertRowid, catIds['Investment'], 'income', incomeBase[m] * 0.1, 'Investment Returns', 'Broker', `${month}-20`);

      // Expense transactions spread across the month
      const expCats = [
        { cat: 'Food', pct: 0.25, merchants: ['Supermarket', 'Restaurant', 'Cafe'] },
        { cat: 'Housing', pct: 0.30, merchants: ['Landlord', 'Utilities', 'Internet'] },
        { cat: 'Transport', pct: 0.10, merchants: ['Gas Station', 'Uber', 'Metro'] },
        { cat: 'Shopping', pct: 0.12, merchants: ['Boutique', 'Amazon', 'Mall'] },
        { cat: 'Entertainment', pct: 0.08, merchants: ['Cinema', 'Spotify', 'Netflix'] },
        { cat: 'Health', pct: 0.05, merchants: ['Pharmacy', 'Gym', 'Doctor'] },
        { cat: 'Pantry', pct: 0.06, merchants: ['Grocery Store', 'Market'] },
        { cat: 'Holiday', pct: 0.04, merchants: ['Hotel', 'Airlines', 'Tours'] }
      ];

      for (const ec of expCats) {
        const totalForCat = expenseBase[m] * ec.pct;
        const txCount = 2 + Math.floor(Math.random() * 3);
        for (let t = 0; t < txCount; t++) {
          const day = String(1 + Math.floor(Math.random() * daysInMonth)).padStart(2, '0');
          const merchant = ec.merchants[Math.floor(Math.random() * ec.merchants.length)];
          const amount = totalForCat / txCount * (0.7 + Math.random() * 0.6);
          insertTx.run(userId, acc1.lastInsertRowid, catIds[ec.cat], 'expense',
            Math.round(amount * 100) / 100, `${ec.cat} expense`, merchant, `${month}-${day}`);
        }
      }
    }

    // Weekly data for current week (daily transactions)
    const weekDays = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];
    const weekIncome = [65000, 72000, 58000, 80000, 69000, 74000, 61000];
    const weekExpense = [45000, 52000, 38000, 61000, 48000, 55000, 42000];
    for (let i = 0; i < weekDays.length; i++) {
      insertTx.run(userId, acc1.lastInsertRowid, catIds['Salary'], 'income', weekIncome[i], 'Daily income', 'Various', weekDays[i]);
      insertTx.run(userId, acc1.lastInsertRowid, catIds['Food'], 'expense', weekExpense[i], 'Daily expense', 'Various', weekDays[i]);
    }

    // Investments
    insertInv.run(userId, 'Studies', 'Education', 520, 15, '2026-06-01');
    insertInv.run(userId, 'Cryptocurrency', 'Crypto', 220, -5, '2026-06-01');
    insertInv.run(userId, 'Contributions', 'Retirement', 135, 8, '2026-06-01');
    insertInv.run(userId, 'Stocks and bonds', 'Market', 450, 12, '2026-06-01');
    insertInv.run(userId, 'Assets', 'Real Estate', 827, 6, '2026-06-01');
  });

  seedTx();
}

module.exports = { db, initializeDatabase, seedData };

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const HOST =
  process.env.HOST ||
  (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());

const authRouter = require('./routes/auth');
const plaidRouter = require('./routes/plaid');
const transactionsRouter = require('./routes/transactions');
const budgetsRouter = require('./routes/budgets');
const billsRouter = require('./routes/bills');
const dashboardRouter = require('./routes/dashboard');
const settingsRouter = require('./routes/settings');
const categoriesRouter = require('./routes/categories');
const merchantRulesRouter = require('./routes/merchantRules');
const categoryRulesRouter = require('./routes/categoryRules');
const projectionRouter = require('./routes/projection');
const { authMiddleware } = require('./middleware/auth');

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);

app.use('/api/plaid', authMiddleware, plaidRouter);
app.use('/api/transactions', authMiddleware, transactionsRouter);
app.use('/api/budgets', authMiddleware, budgetsRouter);
app.use('/api/bills', authMiddleware, billsRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/merchant-rules', authMiddleware, merchantRulesRouter);
app.use('/api/category-rules', authMiddleware, categoryRulesRouter);
app.use('/api/projection', authMiddleware, projectionRouter);

app.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
  console.log(`CORS allowing origin: ${FRONTEND_URL}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { app, prisma };

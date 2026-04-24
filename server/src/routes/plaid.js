const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { Products, CountryCode } = require('plaid');
const plaid = require('../lib/plaid');
const { formatCategory } = require('../lib/formatCategory');

const prisma = new PrismaClient();
const router = express.Router();

function balanceSign(type) {
  const t = (type || '').toLowerCase();
  return t === 'credit' || t === 'loan' ? -1 : 1;
}

async function fetchItemBalances(accessToken) {
  const resp = await plaid.accountsBalanceGet({ access_token: accessToken });
  return resp.data.accounts;
}

async function refreshItemBalances(accessToken) {
  const accounts = await fetchItemBalances(accessToken);
  for (const a of accounts) {
    await prisma.account.updateMany({
      where: { id: a.account_id },
      data: {
        balance: a.balances?.current ?? null,
        availableBalance: a.balances?.available ?? null,
        accountNumber: a.mask ?? null,
      },
    });
  }
  return accounts;
}

router.post('/create-link-token', async (req, res) => {
  try {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: 'local-user' },
      client_name: 'Finance App',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('[plaid] create-link-token', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

router.post('/create-link-token-update', async (req, res) => {
  const { itemId } = req.body || {};
  if (typeof itemId !== 'string' || !itemId.trim()) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  try {
    const account = await prisma.account.findFirst({
      where: {
        itemId,
        source: 'plaid',
        accessToken: { not: null },
      },
      select: { accessToken: true },
    });
    if (!account?.accessToken) {
      return res.status(404).json({ error: 'No access token found for this item' });
    }

    const response = await plaid.linkTokenCreate({
      user: { client_user_id: 'local-user' },
      client_name: 'Finance App',
      country_codes: [CountryCode.Us],
      language: 'en',
      access_token: account.accessToken,
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('[plaid] create-link-token-update', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create update link token' });
  }
});

router.post('/exchange-token', async (req, res) => {
  const { public_token, institution_name, accounts } = req.body || {};

  if (!public_token || !Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: 'public_token and accounts[] are required' });
  }

  try {
    const exchange = await plaid.itemPublicTokenExchange({ public_token });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const balances = await fetchItemBalances(accessToken);
    const byId = new Map(balances.map((b) => [b.account_id, b]));

    for (const acct of accounts) {
      const live = byId.get(acct.id);
      const balance = live?.balances?.current ?? null;
      const availableBalance = live?.balances?.available ?? null;
      const accountNumber = live?.mask ?? acct.mask ?? null;

      const baseData = {
        institution: institution_name || 'Unknown',
        name: acct.name,
        type: acct.type,
        source: 'plaid',
        accessToken,
        itemId,
        balance,
        availableBalance,
        accountNumber,
      };

      await prisma.account.upsert({
        where: { id: acct.id },
        update: baseData,
        create: { id: acct.id, ...baseData },
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[plaid] exchange-token', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const plaidAccounts = await prisma.account.findMany({
      where: { source: 'plaid' },
    });

    const itemAccessTokens = new Map();
    for (const a of plaidAccounts) {
      if (a.accessToken && a.itemId && !itemAccessTokens.has(a.itemId)) {
        itemAccessTokens.set(a.itemId, a.accessToken);
      }
    }

    let added = 0;

    for (const [, accessToken] of itemAccessTokens) {
      let cursor;
      let hasMore = true;

      while (hasMore) {
        const resp = await plaid.transactionsSync({
          access_token: accessToken,
          cursor,
        });

        for (const t of resp.data.added) {
          const acct = await prisma.account.findUnique({
            where: { id: t.account_id },
            select: { id: true },
          });
          if (!acct) continue;

          const existing = await prisma.transaction.findUnique({
            where: { id: t.transaction_id },
            select: { id: true },
          });

          const rawCategory =
            t.personal_finance_category?.primary ||
            (Array.isArray(t.category) && t.category[0]) ||
            null;
          const category = rawCategory ? formatCategory(rawCategory) : null;

          const data = {
            accountId: t.account_id,
            date: new Date(t.date),
            description: t.name,
            merchantName: t.merchant_name || null,
            logoUrl: t.logo_url || null,
            amount: t.amount,
            category,
            pending: t.pending === true,
            source: 'plaid',
          };

          await prisma.transaction.upsert({
            where: { id: t.transaction_id },
            update: data,
            create: { id: t.transaction_id, ...data },
          });

          if (!existing) added++;
        }

        hasMore = resp.data.has_more;
        cursor = resp.data.next_cursor;
      }
    }

    for (const [, accessToken] of itemAccessTokens) {
      try {
        await refreshItemBalances(accessToken);
      } catch (err) {
        console.error('[plaid] sync balance refresh', err.response?.data || err.message);
      }
    }

    res.json({ added });
  } catch (err) {
    console.error('[plaid] sync', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
});

router.post('/refresh-balances', async (req, res) => {
  try {
    const plaidAccounts = await prisma.account.findMany({
      where: { source: 'plaid' },
    });

    const itemAccessTokens = new Map();
    for (const a of plaidAccounts) {
      if (a.accessToken && a.itemId && !itemAccessTokens.has(a.itemId)) {
        itemAccessTokens.set(a.itemId, a.accessToken);
      }
    }

    const failed = [];
    for (const [itemId, accessToken] of itemAccessTokens) {
      try {
        await refreshItemBalances(accessToken);
      } catch (err) {
        const details = err.response?.data || { message: err.message };
        console.error('[plaid] refresh-balances item', itemId, details);
        failed.push({ itemId, error: details.error_code || details.message });
      }
    }

    const updated = await prisma.account.findMany({
      where: { source: 'plaid' },
      select: {
        id: true,
        institution: true,
        name: true,
        type: true,
        balance: true,
        availableBalance: true,
        accountNumber: true,
      },
      orderBy: [{ institution: 'asc' }, { name: 'asc' }],
    });

    res.json({ accounts: updated, failed });
  } catch (err) {
    console.error('[plaid] refresh-balances', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to refresh balances' });
  }
});

router.get('/balances', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { source: 'plaid' },
      select: {
        id: true,
        institution: true,
        name: true,
        type: true,
        balance: true,
        availableBalance: true,
        accountNumber: true,
        itemId: true,
      },
      orderBy: [{ institution: 'asc' }, { name: 'asc' }],
    });

    const groups = new Map();
    for (const a of accounts) {
      const key = a.institution || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }

    const institutions = [...groups.entries()].map(([name, list]) => {
      const subtotal = list.reduce(
        (s, a) => s + balanceSign(a.type) * (a.balance || 0),
        0
      );
      return { name, total: subtotal, accounts: list };
    });

    const total = institutions.reduce((s, inst) => s + inst.total, 0);
    res.json({ total, institutions });
  } catch (err) {
    console.error('[plaid] balances', err.message);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

router.post('/disconnect-item', async (req, res) => {
  const { itemId } = req.body || {};
  if (typeof itemId !== 'string' || !itemId.trim()) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  try {
    const sample = await prisma.account.findFirst({
      where: { itemId, source: 'plaid' },
      select: { accessToken: true },
    });

    if (sample?.accessToken) {
      try {
        await plaid.itemRemove({ access_token: sample.accessToken });
      } catch (err) {
        console.warn('[plaid] itemRemove failed, continuing', err.response?.data || err.message);
      }
    }

    await prisma.account.updateMany({
      where: { itemId, source: 'plaid' },
      data: { accessToken: null, itemId: null },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[plaid] disconnect-item', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to disconnect item' });
  }
});

router.get('/accounts', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { source: 'plaid' },
      select: {
        id: true,
        institution: true,
        name: true,
        type: true,
        source: true,
        balance: true,
        availableBalance: true,
        accountNumber: true,
        createdAt: true,
      },
      orderBy: [{ institution: 'asc' }, { name: 'asc' }],
    });
    res.json(accounts);
  } catch (err) {
    console.error('[plaid] accounts', err.message);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

module.exports = router;

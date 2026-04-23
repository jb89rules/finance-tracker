const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { Products, CountryCode } = require('plaid');
const plaid = require('../lib/plaid');

const prisma = new PrismaClient();
const router = express.Router();

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

router.post('/exchange-token', async (req, res) => {
  const { public_token, institution_name, accounts } = req.body || {};

  if (!public_token || !Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: 'public_token and accounts[] are required' });
  }

  try {
    const exchange = await plaid.itemPublicTokenExchange({ public_token });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    for (const acct of accounts) {
      await prisma.account.upsert({
        where: { id: acct.id },
        update: {
          institution: institution_name || 'Unknown',
          name: acct.name,
          type: acct.type,
          source: 'plaid',
          accessToken,
          itemId,
        },
        create: {
          id: acct.id,
          institution: institution_name || 'Unknown',
          name: acct.name,
          type: acct.type,
          source: 'plaid',
          accessToken,
          itemId,
        },
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

          const category =
            t.personal_finance_category?.primary ||
            (Array.isArray(t.category) && t.category[0]) ||
            null;

          await prisma.transaction.upsert({
            where: { id: t.transaction_id },
            update: {
              accountId: t.account_id,
              date: new Date(t.date),
              description: t.name,
              amount: t.amount,
              category,
              source: 'plaid',
            },
            create: {
              id: t.transaction_id,
              accountId: t.account_id,
              date: new Date(t.date),
              description: t.name,
              amount: t.amount,
              category,
              source: 'plaid',
            },
          });

          if (!existing) added++;
        }

        hasMore = resp.data.has_more;
        cursor = resp.data.next_cursor;
      }
    }

    res.json({ added });
  } catch (err) {
    console.error('[plaid] sync', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to sync transactions' });
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
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(accounts);
  } catch (err) {
    console.error('[plaid] accounts', err.message);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

module.exports = router;

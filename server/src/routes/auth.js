const express = require('express');
const { hashPassword } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    console.error('[auth] APP_PASSWORD is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (typeof password !== 'string' || password !== appPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  res.json({ token: hashPassword(appPassword) });
});

module.exports = router;

const crypto = require('crypto');

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function authMiddleware(req, res, next) {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    console.error('[auth] APP_PASSWORD is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const expected = hashPassword(appPassword);
  const provided = match[1];

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = { authMiddleware, hashPassword };

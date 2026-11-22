const express = require('express');
const support = require('../../ai/support');
const { rateLimit, safeEqual } = require('../../security');

const router = express.Router();
const chatLimit = rateLimit('support', { max: 20, windowMs: 5 * 60_000, key: (r) => r.session.user?.id || r.ip, message: 'Too many messages. Wait a few minutes.' });

// JSON body only for this endpoint; CSRF via session token in the payload.
router.post('/api/support/chat', chatLimit, express.json({ limit: '32kb' }), async (req, res) => {
  if (!safeEqual(req.body?._csrf, req.session.csrf)) return res.status(403).json({ error: 'csrf' });
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  try {
    const out = await support.chat({ history, userId: req.session.user?.id });
    res.json({ reply: out.reply, ai: out.ai });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.get('/api/support/meta', (req, res) => res.json({ ai: support.enabled() }));

module.exports = router;

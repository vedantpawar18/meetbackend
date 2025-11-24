const express = require('express');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/users/me - return current authenticated user (password excluded by middleware)
router.get('/me', auth, async (req, res) => {
  // auth middleware attaches `req.user` (without passwordHash)
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  res.json(req.user);
});

module.exports = router;

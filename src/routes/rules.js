const express = require('express');
const auth = require('../middleware/auth');
const Rule = require('../models/Rule');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const all = await Rule.find().sort('priority');
  res.json(all);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const rule = await Rule.create(req.body);
  res.status(201).json(rule);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const rule = await Rule.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(rule);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  await Rule.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const auth = require('../middleware/auth');
const Department = require('../models/Department');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const list = await Department.find().sort('name');
  res.json(list);
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const { name, description } = req.body;
  const d = await Department.create({ name, description });
  res.status(201).json(d);
});

// PUT / - create or update (upsert) department
router.put('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const { id, _id, name, description } = req.body;
  const docId = id || _id;
  try {
    if (docId) {
      // update existing
      const updated = await Department.findByIdAndUpdate(docId, { name, description }, { new: true });
      if (!updated) return res.status(404).json({ message: 'Department not found' });
      return res.json(updated);
    }

    // create new
    const created = await Department.create({ name, description });
    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const d = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(d);
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  await Department.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

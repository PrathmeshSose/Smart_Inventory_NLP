const express = require('express');
const router = express.Router();
const Item = require('../models/Item');

// GET all items
router.get('/', async (req, res) => {
  try {
    const items = await Item.find();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST add item
router.post('/', async (req, res) => {
  try {
    // Ensure numeric fields are numbers and category exists
    const payload = {
      ...req.body,
      quantity: Number(req.body.quantity) || 0,
      price: Number(req.body.price) || 0,
      minStock: Number(req.body.minStock) || 0,
      category: req.body.category || 'General'
    };
    const item = new Item(payload);
    await item.save();
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update item
router.put('/:id', async (req, res) => {
  try {
    const payload = {
      ...req.body,
      quantity: Number(req.body.quantity) || 0,
      price: Number(req.body.price) || 0,
      minStock: Number(req.body.minStock) || 0,
      category: req.body.category || 'General'
    };
    const item = await Item.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE item
router.delete('/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
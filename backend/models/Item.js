const mongoose = require('mongoose');

// Inventory item schema
const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, default: 'General' },  // ✅ Default if NLP doesn’t provide one
  quantity: { type: Number, default: 0 },
  price: { type: Number, default: 0 },             // ✅ Default so it never fails validation
  minStock: { type: Number, default: 0 }
}, { timestamps: true });

// Prevent model overwrite on re-imports
module.exports = mongoose.models.Item || mongoose.model('Item', itemSchema);

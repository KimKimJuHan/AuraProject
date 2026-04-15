const mongoose = require('mongoose');

const FaqSchema = new mongoose.Schema(
  {
    category: { type: String, default: '일반' },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Faq', FaqSchema);
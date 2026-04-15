const mongoose = require('mongoose');

const InquirySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    category: {
      type: String,
      enum: ['account', 'recommend', 'steam', 'bug', 'etc'],
      default: 'etc',
      required: true,
    },

    title: { type: String, required: true, maxlength: 100 },
    content: { type: String, required: true, maxlength: 5000 },
    status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open' },
    answer: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inquiry', InquirySchema);
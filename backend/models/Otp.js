const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  purpose: { type: String, required: true, index: true }, // signup | find-username | reset-password
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('Otp', otpSchema);
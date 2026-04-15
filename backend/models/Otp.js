const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  purpose: { type: String, enum: ['signup', 'find-id', 'password-reset'], default: 'signup' },
  createdAt: { type: Date, default: Date.now, expires: 600 }
});

// compound index so each (email, purpose) pair has at most one OTP record
otpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('Otp', otpSchema);
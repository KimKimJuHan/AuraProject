const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  purpose: { type: String, required: true, index: true }, // signup | find-username | reset-password
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });
// MongoDB TTL 인덱스: expiresAt 시각이 지나면 자동 삭제 (MongoDB가 백그라운드에서 처리)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
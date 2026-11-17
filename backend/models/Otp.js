const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  // signup | signup-verified | find-username | reset-password
  purpose: { type: String, required: true, index: true },
  // OTP 6자리 코드, 또는 signup-verified 의 경우 가입 토큰의 SHA-256 해시
  code: { type: String, required: true },
  attempts: { type: Number, default: 0 }, // 틀린 시도 횟수 (한도 초과 시 코드 폐기)
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });
// MongoDB TTL 인덱스: expiresAt 시각이 지나면 자동 삭제 (MongoDB가 백그라운드에서 처리)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  steamId: { type: String },
  role: { type: String, default: 'user' },
  isVerified: { type: Boolean, default: false },
  // 사용자가 선호하는 태그 목록
  likedTags: [{ type: String }] 
});

// 비밀번호 암호화 저장
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ★ [핵심] 로그인 시 비밀번호 비교 메서드 (이게 없으면 500 에러 발생)
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
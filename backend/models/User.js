const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // bcryptjs 라이브러리 로드

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  wishlist: [{ type: String }],
  likedTags: [{ type: String }],
  steamId: { type: String }, // Steam 연동을 위해 스키마에 명시 (선택사항)
  createdAt: { type: Date, default: Date.now }
});

// 1. 비밀번호 저장 전 자동 암호화 (회원가입 시 발동)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 2. 비밀번호 일치 확인 메서드 (로그인 시 발동)
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
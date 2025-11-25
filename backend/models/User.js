const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  wishlist: [{ type: String }], 
  likedTags: [{ type: String }],
  
  // ★★★ [핵심 수정] 이 줄이 있어야 스팀 ID가 DB에 저장됩니다! ★★★
  steamId: { type: String }, 
  
  createdAt: { type: Date, default: Date.now }
});

// 비밀번호 암호화
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 비밀번호 확인
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
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
  likedTags: [{ type: String }],
  wishlist: [{ type: String }], 
  
  // ★ [추가됨] 스팀 게임 플레이 정보 저장용 필드
  steamGames: [{
      appid: Number,
      name: String,
      playtime_forever: Number, // 분 단위 플레이 타임
      img_icon_url: String
  }]
});

// 비밀번호 암호화 저장
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 로그인 비밀번호 검증
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
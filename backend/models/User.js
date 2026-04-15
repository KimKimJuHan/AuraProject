const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, // 고유 ID용
    displayName: { type: String }, // ★ 추가: 유저 화면 표시용 (실명 또는 닉네임)
    avatar: { type: String },      // ★ 추가: 프로필 사진 연동
    password: { type: String }, 
    email: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    passwordResetTokenHash: { type: String },
    passwordResetTokenExpiresAt: { type: Date },
    googleId: { type: String }, 
    naverId: { type: String },  
    steamId: { type: String },
    steamGames: [{
        appid: Number,
        name: String,
        playtime_forever: Number,
        img_icon_url: String
    }],
    likedTags: { type: [String], default: [] },
    wishlist: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
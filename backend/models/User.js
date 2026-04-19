const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, // 고유 ID용
    displayName: { type: String }, // 유저 화면 표시용 (실명 또는 닉네임)
    avatar: { type: String },      // 프로필 사진 연동
    password: { type: String }, 
    email: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    
    // ★ 추가: 유저 플레이 성향 (스팀 플레이타임 연동 시 자동 업데이트됨)
    playerType: {
        type: String,
        enum: ['초심자', '심화'],
        default: '초심자'
    },

    passwordResetTokenHash: { type: String },
    passwordResetTokenExpiresAt: { type: Date },
    googleId: { type: String }, 
    naverId: { type: String },  
    steamId: { type: String },
    
    steamGames: [{
        appid: Number,
        name: String,
        playtime_forever: Number,
        img_icon_url: String,
        smart_tags: [String] // ★ 추가: 추천 이유 생성 시 태그 매칭을 위해 필수
    }],
    
    likedTags: { type: [String], default: [] },
    wishlist: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
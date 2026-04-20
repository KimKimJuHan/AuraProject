const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, // 고유 ID용
    displayName: { type: String }, // 유저 화면 표시용 (실명 또는 닉네임)
    avatar: { type: String },      // 프로필 사진 연동
    password: { type: String }, 
    email: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    
    // ★ 수정: 유저 플레이 성향 기반 맞춤 추천을 위한 핵심 필드 확장
    // 향후 스팀 로그인 연동 시, 플레이타임 총합과 보유 게임 개수에 따라 자동 등급이 나뉩니다.
    playerType: {
        type: String,
        enum: ['beginner', 'intermediate', 'streamer'], // 초심자, 중급자, 방송인(하드코어 유저)
        default: 'beginner'
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
        smart_tags: [String] 
    }],
    
    likedTags: { type: [String], default: [] },
    wishlist: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
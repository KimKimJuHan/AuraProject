const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, 
    displayName: { type: String }, 
    avatar: { type: String },      
    password: { type: String }, 
    email: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    
    // ★ 복구: 유저 플레이 성향 (기본값: 초심자)
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
        smart_tags: [String] // ★ 복구: 추천 이유 생성을 위해 스팀 게임에도 태그를 저장해야 함
    }],
    
    likedTags: { type: [String], default: [] },
    wishlist: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
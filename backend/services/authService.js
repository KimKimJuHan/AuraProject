// backend/services/authService.js
const User = require('../models/User');

class AuthService {
    async handleSteamLogin(profile) {
        // 스팀 프로필에서 고유 ID와 정보 추출
        const steamId = profile.id;
        const displayName = profile.displayName || 'Unknown';
        const avatar = profile.photos && profile.photos[2] ? profile.photos[2].value : '';

        // DB에 유저가 있으면 업데이트, 없으면 생성 (Upsert)
        let user = await User.findOneAndUpdate(
            { steamId },
            { 
                $set: { 
                    steamId, 
                    displayName, 
                    avatar, 
                    lastLogin: new Date() 
                } 
            },
            { new: true, upsert: true }
        );

        return user;
    }
}

module.exports = new AuthService();
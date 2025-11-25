// backend/middleware/auth.js

const jwt = require('jsonwebtoken');
// User 모델 경로 조정 (middleware 폴더에서 models 폴더로 접근)
const User = require('../models/User'); 

/**
 * JWT 토큰을 쿠키에서 검증하고, 유저 정보를 req.user에 삽입하는 미들웨어
 */
const authenticateToken = async (req, res, next) => {
    // 1. 쿠키에서 'token' 이름의 JWT 토큰을 가져옵니다. (cookie-parser 필요)
    const token = req.cookies?.token; 

    if (!token) {
        // 토큰이 없으면 인증 실패 (401 Unauthorized)
        return res.status(401).json({ message: '인증 토큰이 없습니다. 다시 로그인해주세요.' });
    }

    try {
        // 2. 토큰 검증
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. 사용자 ID로 DB에서 사용자 정보를 찾고, 비밀번호 필드는 제외합니다.
        // req.user에 steamId가 포함되도록 합니다.
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        // 4. req.user에 사용자 정보를 할당하여 다음 라우터에서 사용할 수 있게 합니다.
        req.user = user;
        next();
    } catch (err) {
        // 토큰이 유효하지 않거나 만료된 경우 (403 Forbidden)
        return res.status(403).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
    }
};

module.exports = { authenticateToken };
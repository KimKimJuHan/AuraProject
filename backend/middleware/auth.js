// backend/middleware/auth.js

const jwt = require('jsonwebtoken');
const User = require('../models/User'); 

const authenticateToken = async (req, res, next) => {
    // 1. 쿠키에서 토큰 가져오기
    const token = req.cookies?.token; 

    if (!token) {
        return res.status(401).json({ message: '인증 토큰이 없습니다.' });
    }

    try {
        // 2. 토큰 검증 (비밀키는 .env의 설정과 같거나 임시 키 'secretKey' 사용)
        // routes/auth.js와 키가 일치해야 로그인이 유지됩니다.
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        
        // 3. 유저 정보 찾기 (비밀번호 제외)
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        // 4. 다음 단계로 유저 정보 전달
        req.user = user;
        next(); 
    } catch (err) {
        return res.status(403).json({ message: '토큰이 유효하지 않거나 만료되었습니다.' });
    }
};

// ★★★ 여기가 제일 중요합니다. 중괄호 { }로 감싸서 내보냅니다. ★★★
module.exports = { authenticateToken };
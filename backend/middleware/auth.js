// backend/middleware/auth.js

const jwt = require('jsonwebtoken');
const User = require('../models/User'); 

const authenticateToken = async (req, res, next) => {
    try {
        // 1. 소셜/스팀 로그인 (Passport 세션) 인증 통과
        if (req.isAuthenticated && req.isAuthenticated()) {
            return next();
        }
        
        // 2. 자체 로그인 (일반 Express 세션) 인증 통과
        if (req.session && req.session.user) {
            req.user = { _id: req.session.user.id, ...req.session.user };
            return next();
        }

        // 3. 기존 방식: 쿠키에서 JWT 토큰 가져와서 검증 (누락 복구)
        const token = req.cookies?.token; 
        
        if (token) {
            // 토큰 검증
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
            
            // 유저 정보 찾기 (비밀번호 제외)
            const user = await User.findById(decoded.id).select('-password');
            
            if (user) {
                req.user = user;
                return next(); 
            }
        }

        // 위 3가지 중 아무것도 해당하지 않으면 최종 차단
        return res.status(401).json({ message: '인증 토큰이 없거나 로그인이 필요합니다.' });

    } catch (err) {
        // JWT 토큰 만료 또는 손상 시 에러 처리
        console.error("Auth Middleware Error:", err.message);
        return res.status(403).json({ message: '토큰이 유효하지 않거나 만료되었습니다.' });
    }
};

// ★★★ 중괄호 { }로 감싸서 내보냄 ★★★
module.exports = { authenticateToken };
// backend/controllers/authController.js
const authService = require('../services/authService');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

class AuthController {
    // 스팀 인증 후 콜백 처리
    async steamCallback(req, res) {
        try {
            if (!req.user) {
                return res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
            }

            // 비즈니스 로직(DB 저장) 호출
            const user = await authService.handleSteamLogin(req.user);

            // 보안 통신을 위한 Session Cookie 발급 보장
            req.session.userId = user._id;
            
            // 인증 성공 후 프론트엔드 메인으로 리다이렉트
            res.redirect(`${FRONTEND_URL}/?login=success`);
        } catch (error) {
            console.error('Steam Auth Error:', error);
            res.redirect(`${FRONTEND_URL}/login?error=server_error`);
        }
    }

    // 현재 로그인 상태 확인 API
    checkStatus(req, res) {
        if (req.isAuthenticated() && req.user) {
            res.json({
                isAuthenticated: true,
                user: {
                    steamId: req.user.id,
                    displayName: req.user.displayName,
                    avatar: req.user.photos ? req.user.photos[2].value : null
                }
            });
        } else {
            res.json({ isAuthenticated: false, user: null });
        }
    }

    // 로그아웃 처리
    logout(req, res) {
        req.logout((err) => {
            if (err) return res.status(500).json({ message: "Logout Failed" });
            
            // 세션 완전히 파기
            req.session.destroy(() => {
                res.clearCookie('connect.sid'); // 기본 세션 쿠키 삭제
                res.json({ message: 'Logout Successful' });
            });
        });
    }
}

module.exports = new AuthController();
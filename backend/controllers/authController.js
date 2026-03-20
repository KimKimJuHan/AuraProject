const User = require('../models/User');
const bcrypt = require('bcrypt');

class AuthController {
    // 자체 회원가입
    async signup(req, res) {
        try {
            const { username, password, email } = req.body;
            
            // 중복 검사
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                return res.status(400).json({ success: false, message: '이미 존재하는 아이디입니다.' });
            }

            // 비밀번호 암호화 (Salt 10번)
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // DB 저장
            const newUser = new User({ username, password: hashedPassword, email });
            await newUser.save();

            res.status(201).json({ success: true, message: '회원가입이 완료되었습니다.' });
        } catch (error) {
            console.error('Signup Error:', error);
            res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
        }
    }

    // 자체 로그인
    async login(req, res) {
        try {
            const { username, password, rememberMe } = req.body;
            
            // 유저 찾기
            const user = await User.findOne({ username });
            if (!user) {
                return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
            }

            // 비밀번호 검증
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
            }

            // 세션 발급
            req.session.user = { id: user._id, username: user.username };
            
            // 동적 세션 제어 (로그인 유지 체크박스)
            if (rememberMe) {
                req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30; // 30일 유지
            } else {
                req.session.cookie.expires = false; // 브라우저 종료 시 로그아웃
            }

            res.json({ success: true, user: req.session.user });
        } catch (error) {
            console.error('Login Error:', error);
            res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
        }
    }

    // 로그인 상태 확인
    checkStatus(req, res) {
        if (req.session && req.session.user) {
            res.json({ isAuthenticated: true, user: req.session.user });
        } else {
            res.json({ isAuthenticated: false, user: null });
        }
    }

    // 로그아웃
    logout(req, res) {
        req.session.destroy(() => {
            res.clearCookie('connect.sid'); // 세션 쿠키 삭제
            res.json({ success: true, message: '로그아웃 되었습니다.' });
        });
    }
}

module.exports = new AuthController();
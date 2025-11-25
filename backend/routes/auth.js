// backend/routes/auth.js

const express = require('express');
const router = express.Router();
const User = require('../models/User'); // User 모델 로드
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport'); // passport 로드
const { authenticateToken } = require('../middleware/auth'); // JWT 미들웨어 로드 가정

// /api/auth/register
router.post('/register', async (req, res) => {
    const { email, password, username } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: '이미 존재하는 이메일입니다.' });
        }

        const user = await User.create({
            email,
            password,
            username,
            isVerified: true // 단순화를 위해 즉시 인증 처리
        });

        if (user) {
            res.status(201).json({ message: '회원가입 성공. 로그인해주세요.' });
        } else {
            res.status(400).json({ message: '잘못된 사용자 데이터입니다.' });
        }
    } catch (error) {
        res.status(500).json({ message: '서버 내부 오류', error: error.message });
    }
});

// /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
                expiresIn: '1d',
            });

            res.cookie('token', token, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000 // 1 day
            });

            res.json({
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                steamId: user.steamId // SteamID 포함하여 반환
            });
        } else {
            res.status(401).json({ message: '잘못된 이메일 또는 비밀번호입니다.' });
        }
    } catch (error) {
        res.status(500).json({ message: '서버 내부 오류' });
    }
});

// /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: '로그아웃 성공' });
});

// ★★★ Steam OpenID 로그인 라우트 추가 ★★★

// /api/auth/steam
// 1. Steam 로그인 시작: Steam으로 리디렉션
router.get('/steam', (req, res, next) => {
    // 세션에 현재 로그인 유저의 ID를 저장합니다. (연동 시 필요)
    if (req.query.link && req.isAuthenticated()) {
        req.session.linkUserId = req.user._id;
    }
    passport.authenticate('steam')(req, res, next);
});

// /api/auth/steam/return
// 2. Steam 콜백 처리: 인증 성공/실패 처리
router.get('/steam/return', 
    passport.authenticate('steam', { 
        failureRedirect: process.env.FRONTEND_URL || 'http://localhost:3000' + '/login' // 실패 시 로그인 페이지
    }),
    async (req, res) => {
        const user = req.user; // DB에서 조회된 User 객체

        // 1. 연동 모드 처리 (이미 로그인 상태에서 Steam 연동 버튼을 눌렀을 경우)
        if (req.session.linkUserId) {
            // 이미 JWT 로그인된 유저가 Steam 인증을 완료했을 때
            const existingUser = await User.findById(req.session.linkUserId);
            if (existingUser) {
                existingUser.steamId = user.steamId;
                await existingUser.save();
                req.session.linkUserId = null; // 세션 초기화
                // 성공 메시지와 함께 프론트엔드로 리디렉션
                return res.redirect((process.env.FRONTEND_URL || 'http://localhost:3000') + '/mypage?link=success');
            }
        } 
        
        // 2. 로그인 모드 처리 (Steam으로 바로 로그인한 경우)
        if (user._id) {
            const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
                expiresIn: '1d',
            });
            
            res.cookie('token', token, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000
            });
            
            // 로그인 성공 후 개인 추천 페이지로 리디렉션
            return res.redirect((process.env.FRONTEND_URL || 'http://localhost:3000') + '/recommend/personal');
        }

        // 로그인도 연동도 아닌 알 수 없는 상태 (실패 처리)
        res.redirect((process.env.FRONTEND_URL || 'http://localhost:3000') + '/login?error=steam_link_failed');
    }
);


module.exports = router;
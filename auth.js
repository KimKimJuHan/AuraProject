// backend/routes/auth.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Otp = require('../models/Otp');
const jwt = require('jsonwebtoken');
const passport = require('passport');

// DB 초기화
router.get('/debug/reset', async (req, res) => {
    try {
        await User.deleteMany({});
        await Otp.deleteMany({});
        res.send('<h1>DB 초기화 완료</h1><a href="http://localhost:3000/signup">회원가입 이동</a>');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 1. 회원가입
router.post('/signup', async (req, res) => {
  const { email, username } = req.body;

  try {
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ error: "이미 존재하는 계정입니다." });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.deleteOne({ email });
    await Otp.create({ email, code, expiresAt: new Date(Date.now() + 600000) });
    console.log(`🔑 인증코드 [${email}]: ${code}`);

    res.status(200).json({ message: "인증코드 발송" });
  } catch (e) {
    res.status(500).json({ error: "오류 발생" });
  }
});

// 2. 인증
router.post('/verify', async (req, res) => {
  const { email, password, username, code } = req.body;
  try {
    const otp = await Otp.findOne({ email });
    if (!otp || otp.code !== code) return res.status(400).json({ error: "코드 불일치" });

    await User.create({ username, email, password, isVerified: true });
    await Otp.deleteOne({ email });

    res.status(201).json({ message: "가입 완료" });
  } catch (e) {
    res.status(500).json({ error: "오류 발생" });
  }
});

// 3. 로그인
router.post('/login', async (req, res) => {
    const { username, password, rememberMe } = req.body;
    const loginId = username;

    if (!loginId || !password) return res.status(400).json({ error: "입력값 부족" });

    try {
        const user = await User.findOne({ $or: [{ username: loginId }, { email: loginId }] });
        if (!user || !(await user.matchPassword(password))) return res.status(401).json({ error: "정보 불일치" });

        const expiresIn = rememberMe ? '7d' : '1d';
        const maxAge = rememberMe ? 7 * 86400000 : 86400000;
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secretKey', { expiresIn });

        res.cookie('token', token, { httpOnly: true, maxAge });
        res.json({ user, token });
    } catch (e) {
        res.status(500).json({ error: "서버 오류" });
    }
});

// 4. 로그아웃
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: '로그아웃' });
});

// ===============================================
// ★ 스팀 연동 (강화된 로직)
// ===============================================

router.get('/steam', async (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) return res.status(401).send("로그인이 필요합니다.");

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        if (!req.session) req.session = {};

        // 세션에 '누가 요청했는지' 저장
        req.session.linkingUserId = decoded.id;

        req.session.save((err) => {
            if (err) console.error("Session Save Error:", err);
            next();
        });
    } catch (err) {
        return res.status(401).send("세션 만료");
    }
}, passport.authenticate('steam'));

router.get('/steam/return',
    passport.authenticate('steam', { failureRedirect: 'http://localhost:3000/recommend/personal?error=steam_fail' }),
    async (req, res) => {
        const steamProfile = req.user;
        let targetUserId = req.session.linkingUserId;

        // ★ [핵심] 세션이 날아갔을 경우를 대비해, 쿠키(JWT)를 다시 한 번 확인하여 복구 시도
        if (!targetUserId && req.cookies && req.cookies.token) {
            try {
                const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET || 'secretKey');
                targetUserId = decoded.id;
                console.log(`[세션 복구 성공] 토큰에서 유저 ID 추출: ${targetUserId}`);
            } catch (e) {
                console.error("[세션 복구 실패] 토큰 무효");
            }
        }

        const steamId = steamProfile.id || (steamProfile._json && steamProfile._json.steamid);

        if (targetUserId && steamId) {
            try {
                await User.findByIdAndUpdate(targetUserId, { steamId: steamId });
                req.session.linkingUserId = null;
                console.log(`[스팀 연동 성공] User: ${targetUserId}, SteamID: ${steamId}`);

                // 성공 파라미터를 명확히 전달
                return res.redirect(`http://localhost:3000/recommend/personal?steamId=${steamId}&status=success`);
            } catch (err) {
                console.error(err);
                return res.redirect('http://localhost:3000/recommend/personal?error=db_error');
            }
        }

        console.error(`[스팀 연동 실패] 유저ID: ${targetUserId}, SteamID: ${steamId}`);
        res.redirect('http://localhost:3000/recommend/personal?error=unknown_user');
    }
);

module.exports = router;

// backend/routes/auth.js

const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const Otp = require('../models/Otp');   
const jwt = require('jsonwebtoken');
const passport = require('passport');

// ==========================================
// 🛠️ [비상용] DB 초기화 도구 (복구됨)
// ==========================================
router.get('/debug/reset', async (req, res) => {
    try {
        await User.deleteMany({});
        await Otp.deleteMany({});
        res.send(`
            <h1 style="color:green">✅ DB 초기화 완료</h1>
            <p>모든 유저 정보가 삭제되었습니다. 다시 회원가입 해주세요.</p>
            <button onclick="location.href='http://localhost:3000/signup'">회원가입 하러 가기</button>
        `);
    } catch (err) {
        res.status(500).send("초기화 실패: " + err.message);
    }
});

// ==========================================
// 🔐 인증 로직
// ==========================================

// 1. 회원가입 1단계: 인증코드 발송
router.post('/signup', async (req, res) => {
  const { email, username } = req.body;
  console.log(`[회원가입 요청] ${email}`);
  try {
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ error: "이미 존재하는 이메일 또는 닉네임입니다." });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.deleteOne({ email });
    await Otp.create({ email, code, expiresAt: new Date(Date.now() + 600000) }); // 10분 유효

    console.log(`🔑 [인증코드]: ${code}`); // 터미널 확인용
    res.status(200).json({ message: "인증코드가 발송되었습니다." });
  } catch (e) { 
      console.error(e);
      res.status(500).json({ error: "오류 발생" }); 
  }
});

// 2. 회원가입 2단계: 가입 완료
router.post('/verify', async (req, res) => {
  const { email, password, username, code } = req.body;
  try {
    const otp = await Otp.findOne({ email });
    if (!otp || otp.code !== code) return res.status(400).json({ error: "인증코드가 일치하지 않습니다." });

    await User.create({ username, email, password, isVerified: true });
    await Otp.deleteOne({ email });
    res.status(201).json({ message: "가입 완료" });
  } catch (e) { res.status(500).json({ error: "오류 발생" }); }
});

// 3. 로그인 (아이디/이메일 지원 + 유지 기능)
router.post('/login', async (req, res) => {
    const { username, password, rememberMe } = req.body;
    const loginId = username;
    if (!loginId || !password) return res.status(400).json({ error: "입력값 부족" });

    try {
        const user = await User.findOne({ $or: [{ username: loginId }, { email: loginId }] });
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ error: "정보가 일치하지 않습니다." });
        }

        const expiresIn = rememberMe ? '7d' : '1d';
        const maxAge = rememberMe ? 7 * 86400000 : 86400000;
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secretKey', { expiresIn });

        res.cookie('token', token, { httpOnly: true, maxAge });
        res.json({
            user: { _id: user._id, username: user.username, email: user.email, role: user.role, steamId: user.steamId, likedTags: user.likedTags || [] },
            token
        });
    } catch (e) { res.status(500).json({ error: "서버 오류" }); }
});

// 4. 로그아웃
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: '로그아웃 성공' });
});

// ===============================================
// ★ 스팀 연동 (세션 저장 안전장치 포함)
// ===============================================

router.get('/steam', async (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) return res.status(401).send("로그인이 필요합니다.");

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        
        if (!req.session) req.session = {};
        req.session.linkingUserId = decoded.id;
        
        // 세션 저장 후 이동 (500 에러 방지)
        req.session.save((err) => {
            if (err) {
                console.error("Session Save Error:", err);
                return res.status(500).send("세션 저장 실패");
            }
            next();
        });
    } catch (err) {
        return res.status(401).send("로그인 세션 만료");
    }
}, passport.authenticate('steam'));

router.get('/steam/return', 
    passport.authenticate('steam', { failureRedirect: 'http://localhost:3000/recommend/personal?error=steam_fail' }),
    async (req, res) => {
        const steamProfile = req.user;
        const targetUserId = req.session.linkingUserId;

        if (targetUserId && steamProfile) {
            try {
                await User.findByIdAndUpdate(targetUserId, { steamId: steamProfile.id });
                req.session.linkingUserId = null;
                return res.redirect(`http://localhost:3000/recommend/personal?steamId=${steamProfile.id}`);
            } catch (err) {
                return res.redirect('http://localhost:3000/recommend/personal?error=db_error');
            }
        }
        res.redirect('http://localhost:3000/recommend/personal?error=unknown');
    }
);

module.exports = router;
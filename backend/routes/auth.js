// backend/routes/auth.js

const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const Otp = require('../models/Otp');   
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');

// 1. 회원가입 1단계: 인증코드 발송
router.post('/signup', async (req, res) => {
  const { email, username } = req.body;
  console.log(`[회원가입 요청] 이메일: ${email}, 닉네임: ${username}`);

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(400).json({ error: "이미 존재하는 이메일 또는 닉네임입니다." });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.deleteOne({ email });
    await Otp.create({ email, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });

    console.log(`🔑 [인증코드] ${email}: ${code}`);
    res.status(200).json({ message: "인증코드가 발송되었습니다. 서버 콘솔을 확인하세요." });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "인증코드 생성 오류" });
  }
});

// 2. 회원가입 2단계: 인증 및 가입
router.post('/verify', async (req, res) => {
  const { email, password, username, code } = req.body;
  try {
    const otpRecord = await Otp.findOne({ email });
    if (!otpRecord) return res.status(400).json({ error: "인증 요청 기록이 없습니다." });
    if (otpRecord.code !== code) return res.status(400).json({ error: "인증코드가 일치하지 않습니다." });

    await User.create({ username, email, password, isVerified: true });
    await Otp.deleteOne({ email });
    res.status(201).json({ message: "가입 완료! 로그인해주세요." });
  } catch (error) {
    console.error("Verify Error:", error);
    res.status(500).json({ error: "가입 처리 오류" });
  }
});

// 3. 로그인
router.post('/login', async (req, res) => {
    const { username, password, rememberMe } = req.body; 
    const loginId = username; 
    
    if (!loginId || !password) return res.status(400).json({ error: "아이디와 비밀번호를 입력해주세요." });
    
    try {
        const user = await User.findOne({ 
            $or: [{ username: loginId }, { email: loginId }] 
        });
        
        if (!user) return res.status(401).json({ error: '존재하지 않는 사용자입니다.' });

        const isMatch = await user.matchPassword(password);
        if (isMatch) {
            const expiresIn = rememberMe ? '7d' : '1d';
            const maxAge = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
            const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secretKey', { expiresIn });
            
            res.cookie('token', token, { httpOnly: true, maxAge });
            res.json({
                user: { _id: user._id, username: user.username, email: user.email, role: user.role, steamId: user.steamId, likedTags: user.likedTags || [] },
                token
            });
        } else {
            res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
        }
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ error: '서버 내부 오류' });
    }
});

// 4. 로그아웃
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: '로그아웃 성공' });
});

// ===============================================
// ★ 스팀 연동 라우트
// ===============================================

router.get('/steam', async (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) return res.status(401).send("로그인이 필요합니다.");

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        // 세션에 '연동 시도한 유저 ID' 저장
        req.session.linkingUserId = decoded.id;
        
        // 세션 저장 후 passport로 이동 (타이밍 이슈 방지)
        req.session.save((err) => {
            if (err) console.error("Session Save Error:", err);
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
        const targetUserId = req.session.linkingUserId; // 아까 저장한 ID 꺼내기

        console.log(`[스팀 연동 시도] UserID: ${targetUserId}, SteamID: ${steamProfile?.id}`);

        if (targetUserId && steamProfile) {
            try {
                const steamId = steamProfile.id;
                // DB 업데이트
                await User.findByIdAndUpdate(targetUserId, { steamId: steamId });
                
                req.session.linkingUserId = null; // 세션 초기화
                return res.redirect(`http://localhost:3000/recommend/personal?steamId=${steamId}`);
            } catch (err) {
                console.error("Steam Link DB Error:", err);
                return res.redirect('http://localhost:3000/recommend/personal?error=db_error');
            }
        }
        res.redirect('http://localhost:3000/recommend/personal?error=unknown');
    }
);

module.exports = router;
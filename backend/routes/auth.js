// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const Otp = require('../models/Otp');   
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');

// 1. 회원가입 1단계: 인증코드(OTP) 생성 및 발송
router.post('/signup', async (req, res) => {
  const { email, username } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: "이미 존재하는 이메일 또는 닉네임입니다." });
    }

    // 인증코드 생성
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    await Otp.deleteOne({ email });
    await Otp.create({
      email,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) 
    });

    console.log(`=========================================`);
    console.log(`[회원가입 인증코드] 이메일: ${email} | 코드: ${code}`);
    console.log(`=========================================`);

    res.status(200).json({ message: "인증코드가 발송되었습니다." });

  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "인증코드 생성 중 오류가 발생했습니다." });
  }
});

// 2. 회원가입 2단계: 인증 확인 및 가입
router.post('/verify', async (req, res) => {
  const { email, password, username, code } = req.body;
  try {
    const otpRecord = await Otp.findOne({ email });
    if (!otpRecord || otpRecord.code !== code) {
      return res.status(400).json({ error: "인증코드가 일치하지 않거나 만료되었습니다." });
    }

    await User.create({ username, email, password, isVerified: true });
    await Otp.deleteOne({ email });

    res.status(201).json({ message: "가입 완료! 로그인해주세요." });
  } catch (error) {
    res.status(500).json({ error: "가입 처리 중 오류가 발생했습니다." });
  }
});

// 3. 로그인
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && (await user.matchPassword(password))) {
            const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secretKey', { expiresIn: '1d' });
            res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
            res.json({
                user: { _id: user._id, username: user.username, email: user.email, role: user.role, steamId: user.steamId },
                token
            });
        } else {
            res.status(401).json({ error: '이메일 또는 비밀번호 불일치' });
        }
    } catch (error) {
        res.status(500).json({ error: '서버 내부 오류' });
    }
});

// 4. 로그아웃
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: '로그아웃 성공' });
});

// Steam 관련 라우트 유지
router.get('/steam', (req, res, next) => {
    if (req.query.link && req.isAuthenticated()) req.session.linkUserId = req.user._id;
    passport.authenticate('steam')(req, res, next);
});

router.get('/steam/return', passport.authenticate('steam', { failureRedirect: 'http://localhost:3000/login' }), async (req, res) => {
    // (기존 스팀 로그인 로직 유지 - 내용이 길어 생략하지만 파일엔 포함되어 있어야 합니다)
    res.redirect('http://localhost:3000/recommend/personal'); 
});

module.exports = router;
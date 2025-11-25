const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const passport = require('passport');
const User = require('../models/User');
const Otp = require('../models/Otp');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// 메일 설정
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// 1. 회원가입
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    if (await User.findOne({ email })) return res.status(400).json({ error: "이미 가입된 이메일입니다." });
    if (await User.findOne({ username })) return res.status(400).json({ error: "이미 사용 중인 닉네임입니다." });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); 
    
    await Otp.deleteMany({ email });
    await Otp.create({ email, code, expiresAt });
    console.log(`\n🔑 [인증코드] 이메일: ${email} | 코드: ${code}\n`);

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            await transporter.sendMail({
                from: '"PlayForYou" <noreply@game.com>',
                to: email,
                subject: '[Play For You] 회원가입 인증 코드',
                text: `인증 코드: ${code}`
            });
        } catch (mailErr) { console.error("메일 전송 실패:", mailErr.message); }
    }
    res.json({ message: "인증코드가 발송되었습니다." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. 인증 확인
router.post('/verify', async (req, res) => {
  const { email, code, username, password } = req.body;
  try {
    const validOtp = await Otp.findOne({ email, code });
    if (!validOtp || validOtp.expiresAt < new Date()) return res.status(400).json({ error: "인증코드가 틀렸거나 만료되었습니다." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword, isVerified: true });
    await newUser.save();
    await Otp.deleteMany({ email });
    res.json({ message: "가입 완료! 로그인해주세요." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. 로그인
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "가입되지 않은 이메일입니다." });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "비밀번호가 일치하지 않습니다." });
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, wishlist: user.wishlist } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ★ 스팀 로그인 요청
router.get('/steam', passport.authenticate('steam', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/');
});

// ★ 스팀 로그인 콜백
router.get('/steam/return', passport.authenticate('steam', { failureRedirect: '/' }), (req, res) => {
    // 프론트엔드 추천 페이지로 리다이렉트 (스팀 ID 포함)
    res.redirect(`http://localhost:3000/recommend?steamId=${req.user.steamId}`);
});

module.exports = router;
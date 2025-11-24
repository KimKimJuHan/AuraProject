const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Otp = require('../models/Otp');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// 메일 전송 설정
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER, // .env에 있는 Gmail 주소
    pass: process.env.SMTP_PASS  // .env에 있는 앱 비밀번호 (16자리)
  }
});

// 1. 회원가입 (인증코드 발송)
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    if (await User.findOne({ email })) return res.status(400).json({ error: "이미 가입된 이메일입니다." });
    if (await User.findOne({ username })) return res.status(400).json({ error: "이미 사용 중인 닉네임입니다." });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10분 유효
    
    await Otp.deleteMany({ email });
    await Otp.create({ email, code, expiresAt });

    // ★ [수정] 개발 편의를 위해 항상 콘솔에 출력
    console.log(`\n🔑 [인증코드] 이메일: ${email} | 코드: ${code}\n`);

    // 실제 메일 발송 시도
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            await transporter.sendMail({
                from: '"PlayForYou" <noreply@game.com>',
                to: email,
                subject: '[Play For You] 회원가입 인증 코드',
                text: `인증 코드: ${code}`
            });
            console.log("📧 메일 전송 성공!");
        } catch (mailErr) {
            console.error("⚠️ 메일 전송 실패 (콘솔 코드로 인증하세요):", mailErr.message);
        }
    }
    
    res.json({ message: "인증코드가 발송되었습니다." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. 인증코드 확인 및 가입 완료
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

module.exports = router;
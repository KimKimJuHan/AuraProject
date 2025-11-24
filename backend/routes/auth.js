const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Otp = require('../models/Otp');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    if (await User.findOne({ email })) return res.status(400).json({ error: "이미 가입된 이메일입니다." });
    if (await User.findOne({ username })) return res.status(400).json({ error: "이미 사용 중인 닉네임입니다." });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000);
    await Otp.deleteMany({ email });
    await Otp.create({ email, code, expiresAt });
    if (process.env.SMTP_USER) {
        await transporter.sendMail({ from: 'PlayForYou', to: email, subject: '인증코드', text: `코드: ${code}` });
    }
    res.json({ message: "인증코드 발송됨" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify', async (req, res) => {
  const { email, code, username, password } = req.body;
  try {
    const validOtp = await Otp.findOne({ email, code });
    if (!validOtp || validOtp.expiresAt < new Date()) return res.status(400).json({ error: "잘못된 인증코드" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword, isVerified: true });
    await newUser.save();
    await Otp.deleteMany({ email });
    res.json({ message: "가입 완료" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "사용자 없음" });
    if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error: "비번 불일치" });
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, wishlist: user.wishlist } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
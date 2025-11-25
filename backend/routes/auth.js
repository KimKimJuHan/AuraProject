// backend/routes/auth.js

const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const Otp = require('../models/Otp');   
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');

// ★ authenticateToken을 여기서 직접 미들웨어로 쓰지 않고, 내부 로직용으로만 참고하거나 jwt를 직접 씁니다.
// const { authenticateToken } = require('../middleware/auth'); 

// 1. 회원가입 1단계: 인증코드 발송 (기존 유지)
router.post('/signup', async (req, res) => {
  const { email, username } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(400).json({ error: "이미 존재하는 이메일 또는 닉네임입니다." });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.deleteOne({ email });
    await Otp.create({ email, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });

    console.log(`=========================================`);
    console.log(`[회원가입 인증코드] 이메일: ${email} | 코드: ${code}`);
    console.log(`=========================================`);

    res.status(200).json({ message: "인증코드가 발송되었습니다." });
  } catch (error) {
    res.status(500).json({ error: "인증코드 생성 오류" });
  }
});

// 2. 회원가입 2단계: 인증 및 가입 (기존 유지)
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
    res.status(500).json({ error: "가입 처리 오류" });
  }
});

// 3. 로그인 (기존 유지)
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

// 4. 로그아웃 (기존 유지)
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: '로그아웃 성공' });
});

// ==========================================================
// ★★★ 수정된 스팀 연동 로직 (가장 중요한 부분) ★★★
// ==========================================================

// 5. 스팀 인증 시작
// [수정] authenticateToken 미들웨어를 제거했습니다! 대신 함수 안에서 토큰을 검사합니다.
router.get('/steam', async (req, res, next) => {
    
    // 1. 토큰이 있는지 확인 (있으면 해석해서 req.user에 넣음)
    const token = req.cookies?.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
            req.user = await User.findById(decoded.id).select('-password');
        } catch (err) {
            console.log("Token invalid or expired, proceeding as guest.");
        }
    }

    // 2. 연동 요청(?link=true)인지 확인
    if (req.query.link === 'true') {
        // 연동하려면 로그인이 필수!
        if (!req.user) {
            return res.status(401).json({ error: "로그인이 필요한 기능입니다." });
        }

        // "이 사용자가 연동을 시도함"을 세션에 기록
        req.session.linkUserId = req.user._id.toString();
        
        req.session.save((err) => {
            if (err) console.error("Session save error:", err);
            next(); // passport.authenticate로 이동
        });
    } else {
        // 단순 로그인은 토큰 없어도 통과
        next();
    }
}, passport.authenticate('steam'));


// 6. 스팀 인증 후 돌아오는 곳
router.get('/steam/return', 
    passport.authenticate('steam', { failureRedirect: 'http://localhost:3000/login' }),
    async (req, res) => {
        const user = req.user; 

        // [Case 1] 연동 모드: 아까 적어둔 linkUserId가 있으면 연동 진행
        if (req.session.linkUserId) {
            try {
                const existingUser = await User.findById(req.session.linkUserId);
                if (existingUser) {
                    existingUser.steamId = user.steamId;
                    await existingUser.save();
                    
                    req.session.linkUserId = null; // 세션 정리

                    // 연동 성공!
                    return res.redirect(`http://localhost:3000/recommend/personal?steamId=${user.steamId}`);
                }
            } catch (err) {
                console.error("Steam Link Error:", err);
                return res.redirect('http://localhost:3000/recommend/personal?error=link_failed');
            }
        } 
        
        // [Case 2] 로그인 모드 (스팀으로 로그인 시도)
        // (index.js의 전략에서 DB에 있는 유저를 찾아서 반환했을 경우)
        if (user && user._id) {
            const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secretKey', { expiresIn: '1d' });
            res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
            return res.redirect('http://localhost:3000/recommend/personal');
        }

        // 가입된 스팀 계정이 없는 경우 -> 로그인 페이지로
        res.redirect('http://localhost:3000/login');
    }
);

module.exports = router;
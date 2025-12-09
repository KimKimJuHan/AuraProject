// backend/routes/auth.js

const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const Otp = require('../models/Otp');   
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const passport = require('passport');

// DB 초기화
router.get('/debug/reset', async (req, res) => {
    try {
        await User.deleteMany({});
        await Otp.deleteMany({});
        res.send('<h1>DB 초기화 완료</h1><a href="http://localhost:3000/signup">회원가입 이동</a>');
    } catch (err) { res.status(500).send(err.message); }
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

        // 이메일 전송 시도 (환경변수로 SMTP 설정이 있으면 실제 전송, 없으면 서버 콘솔에 코드 노출)
        (async function sendOtp() {
            try {
                const host = process.env.SMTP_HOST;
                const port = process.env.SMTP_PORT;
                const user = process.env.SMTP_USER;
                const pass = process.env.SMTP_PASS;
                const from = process.env.EMAIL_FROM || `no-reply@${process.env.BACKEND_URL?.replace(/^https?:\/\//, '') || 'localhost'}`;

                if (!host || !port || !user || !pass) {
                    console.warn('[OTP] SMTP 설정이 없어 이메일을 전송하지 않았습니다. 콘솔의 코드를 사용하세요.');
                    return;
                }

                const transporter = nodemailer.createTransport({
                    host,
                    port: Number(port),
                    secure: Number(port) === 465, // true for 465, false for other ports
                    auth: { user, pass }
                });

                const info = await transporter.sendMail({
                    from,
                    to: email,
                    subject: '[AuraProject] 이메일 인증 코드',
                    text: `인증 코드: ${code}\n이 코드는 10분 동안 유효합니다.`,
                    html: `<p>인증 코드: <strong>${code}</strong></p><p>이 코드는 10분 동안 유효합니다.</p>`
                });

                console.log('[OTP] 이메일 전송 완료:', info.messageId);
            } catch (err) {
                console.error('[OTP] 이메일 전송 실패:', err && err.message ? err.message : err);
            }
        })();
    res.status(200).json({ message: "인증코드 발송" });
  } catch (e) { res.status(500).json({ error: "오류 발생" }); }
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
  } catch (e) { res.status(500).json({ error: "오류 발생" }); }
});

// 3. 로그인
// 로그인: 이메일 또는 사용자명과 비밀번호로 인증
// - 인증된(verified) 계정이면 기존처럼 토큰 발급
// - 인증되지 않은 계정이면 OTP 발송 후 클라이언트에 `needsOtp: true` 응답
router.post('/login', async (req, res) => {
    const { username, password, rememberMe } = req.body;
    const loginId = username;
    if (!loginId || !password) return res.status(400).json({ error: "입력값 부족" });
    try {
        const user = await User.findOne({ $or: [{ username: loginId }, { email: loginId }] });
        if (!user || !(await user.matchPassword(password))) return res.status(401).json({ error: "정보 불일치" });

        // 무조건 OTP 발송: 로그인 시 항상 이메일 인증을 요구하도록 변경
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await Otp.deleteOne({ email: user.email });
        await Otp.create({ email: user.email, code, expiresAt: new Date(Date.now() + 600000) });
        console.log(`🔑 로그인용 인증코드 [${user.email}]: ${code}`);

        // 이메일 전송 시도 (환경변수로 SMTP 설정이 있으면 실제 전송, 없으면 서버 콘솔에 코드 노출)
        (async function sendOtp() {
            try {
                const host = process.env.SMTP_HOST;
                const port = process.env.SMTP_PORT;
                const userSmtp = process.env.SMTP_USER;
                const pass = process.env.SMTP_PASS;
                const from = process.env.EMAIL_FROM || `no-reply@${process.env.BACKEND_URL?.replace(/^https?:\/\//, '') || 'localhost'}`;

                if (!host || !port || !userSmtp || !pass) {
                    console.warn('[OTP] SMTP 설정이 없어 이메일을 전송하지 않았습니다. 콘솔의 코드를 사용하세요.');
                    return;
                }

                const transporter = nodemailer.createTransport({
                    host,
                    port: Number(port),
                    secure: Number(port) === 465,
                    auth: { user: userSmtp, pass }
                });

                const info = await transporter.sendMail({
                    from,
                    to: user.email,
                    subject: '[AuraProject] 로그인용 인증 코드',
                    text: `인증 코드: ${code}\n이 코드는 10분 동안 유효합니다.`,
                    html: `<p>인증 코드: <strong>${code}</strong></p><p>이 코드는 10분 동안 유효합니다.</p>`
                });

                console.log('[OTP] 로그인용 이메일 전송 완료:', info.messageId);
            } catch (err) {
                console.error('[OTP] 로그인용 이메일 전송 실패:', err && err.message ? err.message : err);
            }
        })();

        // 항상 OTP 검증을 요구
        return res.json({ needsOtp: true, message: '인증 코드가 이메일로 발송되었습니다.' });
    } catch (e) { res.status(500).json({ error: "서버 오류" }); }
});

// 로그인 OTP 검증: 코드가 유효하면 토큰 발급
router.post('/login/verify', async (req, res) => {
    const { loginId, code, rememberMe } = req.body;
    if (!loginId || !code) return res.status(400).json({ error: '입력값 부족' });
    try {
        const user = await User.findOne({ $or: [{ username: loginId }, { email: loginId }] });
        if (!user) return res.status(404).json({ error: '사용자 없음' });

        const otp = await Otp.findOne({ email: user.email });
        if (!otp || otp.code !== code) return res.status(400).json({ error: '코드 불일치' });

        // 인증 성공: 계정에 verified 표시(필요 시) 및 OTP 삭제
        user.isVerified = true;
        await user.save();
        await Otp.deleteOne({ email: user.email });

        const expiresIn = rememberMe ? '7d' : '1d';
        const maxAge = rememberMe ? 7 * 86400000 : 86400000;
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secretKey', { expiresIn });
        res.cookie('token', token, { httpOnly: true, maxAge });
        res.json({ user, token });
    } catch (e) { res.status(500).json({ error: '서버 오류' }); }
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
    } catch (err) { return res.status(401).send("세션 만료"); }
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
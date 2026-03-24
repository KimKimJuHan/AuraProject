const User = require('../models/User');
const Otp = require('../models/Otp');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

class AuthController {
    // OTP 발송 로직 (추가)
    async sendOtp(req, res) {
        try {
            const { email } = req.body;
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 600000); // 10분 후 만료

            await Otp.findOneAndUpdate({ email }, { code, expiresAt }, { upsert: true });

            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
            });

            await transporter.sendMail({
                from: `"AuraProject" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: "[AuraProject] 회원가입 인증 코드",
                text: `인증번호는 [${code}] 입니다.`
            });

            res.json({ success: true, message: '인증 코드가 발송되었습니다.' });
        } catch (error) {
            console.error("OTP 발송 에러:", error);
            res.status(500).json({ success: false, message: "메일 발송 실패" });
        }
    }

    async verifyOtp(req, res) {
        const { email, code } = req.body;
        const otp = await Otp.findOne({ email, code });
        if (!otp || otp.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
        }
        res.json({ success: true });
    }

    async signup(req, res) {
        try {
            const { username, password, email } = req.body;
            const existingUser = await User.findOne({ username });
            if (existingUser) return res.status(400).json({ success: false, message: '이미 존재하는 아이디입니다.' });

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = new User({ username, password: hashedPassword, email });
            await newUser.save();
            res.status(201).json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false });
        }
    }

    async login(req, res) {
        try {
            const { username, password, rememberMe } = req.body;
            const user = await User.findOne({ username });
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
            }

            // ★ 수정: 세션에 email과 steamId를 포함하여 마이페이지에서 사용 가능하게 함
            req.session.user = { 
                id: user._id, 
                username: user.username, 
                email: user.email,
                steamId: user.steamId 
            };
            
            if (rememberMe) req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
            res.json({ success: true, user: req.session.user });
        } catch (e) {
            res.status(500).json({ success: false });
        }
    }

    checkStatus(req, res) {
        // 세션에 저장된 user 객체 전체를 반환 (email 포함됨)
        res.json({ 
            isAuthenticated: !!(req.session && req.session.user), 
            user: req.session?.user || null 
        });
    }

    logout(req, res) {
        req.session.destroy(() => {
            res.clearCookie('connect.sid').json({ success: true });
        });
    }
}

module.exports = new AuthController();
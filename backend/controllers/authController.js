const User = require('../models/User');
const Otp = require('../models/Otp');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Simple in-memory rate-limit: max 5 OTP requests per email per 10 minutes
const otpRateLimit = new Map();
const OTP_RATE_LIMIT_MAX = 5;
const OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function checkOtpRateLimit(email) {
    const now = Date.now();
    const entry = otpRateLimit.get(email);
    if (!entry || now - entry.windowStart > OTP_RATE_LIMIT_WINDOW_MS) {
        otpRateLimit.set(email, { windowStart: now, count: 1 });
        return true;
    }
    if (entry.count >= OTP_RATE_LIMIT_MAX) return false;
    entry.count += 1;
    return true;
}

// Mask username: show first 2 characters, replace the rest with asterisks
function maskUsername(name) {
    if (!name) return '';
    if (name.length <= 2) return name.replace(/./g, '*');
    return name.slice(0, 2) + '*'.repeat(name.length - 2);
}

function getResetTokenSecret() {
    const secret = process.env.RESET_TOKEN_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        console.error('[SECURITY] RESET_TOKEN_SECRET and JWT_SECRET are not set. Password reset is disabled.');
        throw new Error('Reset token secret is not configured.');
    }
    return secret;
}

function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
}

async function sendOtpEmail(email, code, subject) {
    const transporter = createTransporter();
    await transporter.sendMail({
        from: `"AuraProject" <${process.env.EMAIL_USER}>`,
        to: email,
        subject,
        text: `인증번호는 [${code}] 입니다. 10분 이내에 입력해주세요.`
    });
}

class AuthController {
    // OTP 발송 로직 (회원가입용)
    async sendOtp(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });
            const safeEmail = String(email).trim();

            if (!checkOtpRateLimit(safeEmail)) {
                return res.status(429).json({ success: false, message: '잠시 후 다시 시도해주세요.' });
            }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 600000); // 10분 후 만료

            await Otp.findOneAndUpdate(
                { email: safeEmail, purpose: 'signup' },
                { code, expiresAt },
                { upsert: true, new: true }
            );

            await sendOtpEmail(safeEmail, code, '[AuraProject] 회원가입 인증 코드');
            res.json({ success: true, message: '인증 코드가 발송되었습니다.' });
        } catch (error) {
            console.error("OTP 발송 에러:", error);
            res.status(500).json({ success: false, message: "메일 발송 실패" });
        }
    }

    async verifyOtp(req, res) {
        const { email, code } = req.body;
        const safeEmail = String(email || '').trim();
        const safeCode = String(code || '').trim();
        const otp = await Otp.findOne({ email: safeEmail, code: safeCode, purpose: 'signup' });
        if (!otp || otp.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
        }
        res.json({ success: true });
    }

    // ──────────────────────────────────────────────
    // 아이디 찾기 (Find Login ID)
    // ──────────────────────────────────────────────

    // Step 1: 이메일로 OTP 발송 (아이디 찾기용)
    async requestFindId(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });
            const safeEmail = String(email).trim();

            if (!checkOtpRateLimit(safeEmail)) {
                return res.status(429).json({ success: false, message: '잠시 후 다시 시도해주세요.' });
            }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 600000);

            await Otp.findOneAndUpdate(
                { email: safeEmail, purpose: 'find-id' },
                { code, expiresAt },
                { upsert: true, new: true }
            );

            // Always return success to avoid leaking whether email exists
            try {
                await sendOtpEmail(safeEmail, code, '[AuraProject] 아이디 찾기 인증 코드');
            } catch (_) { /* swallow – still respond success */ }

            res.json({ success: true, message: '입력한 이메일로 인증 코드가 발송되었습니다.' });
        } catch (error) {
            console.error("아이디 찾기 OTP 에러:", error);
            res.status(500).json({ success: false, message: '오류가 발생했습니다.' });
        }
    }

    // Step 2: OTP 검증 후 아이디 반환 (마스킹 처리)
    async findId(req, res) {
        try {
            const { email, code } = req.body;
            if (!email || !code) return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });

            const safeEmail = String(email).trim();
            const safeCode = String(code).trim();

            const otp = await Otp.findOne({ email: safeEmail, code: safeCode, purpose: 'find-id' });
            if (!otp || otp.expiresAt < new Date()) {
                return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
            }

            // Delete used OTP
            await Otp.deleteOne({ email: safeEmail, purpose: 'find-id' });

            const users = await User.find({ email: safeEmail }).select('username').lean();

            // Mask username using helper
            const masked = users.map(u => maskUsername(u.username || ''));

            // Always return same structure
            res.json({ success: true, usernames: masked });
        } catch (error) {
            console.error("아이디 찾기 에러:", error);
            res.status(500).json({ success: false, message: '오류가 발생했습니다.' });
        }
    }

    // ──────────────────────────────────────────────
    // 비밀번호 재설정 (Password Reset)
    // ──────────────────────────────────────────────

    // Step 1: 이메일로 OTP 발송 (비밀번호 재설정용)
    async requestPasswordReset(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });
            const safeEmail = String(email).trim();

            if (!checkOtpRateLimit(safeEmail)) {
                return res.status(429).json({ success: false, message: '잠시 후 다시 시도해주세요.' });
            }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 600000);

            await Otp.findOneAndUpdate(
                { email: safeEmail, purpose: 'password-reset' },
                { code, expiresAt },
                { upsert: true, new: true }
            );

            // Always return success
            try {
                await sendOtpEmail(safeEmail, code, '[AuraProject] 비밀번호 재설정 인증 코드');
            } catch (_) { /* swallow */ }

            res.json({ success: true, message: '입력한 이메일로 인증 코드가 발송되었습니다.' });
        } catch (error) {
            console.error("비밀번호 재설정 OTP 에러:", error);
            res.status(500).json({ success: false, message: '오류가 발생했습니다.' });
        }
    }

    // Step 2: OTP 검증 → 단기 reset 토큰 발급
    async verifyResetOtp(req, res) {
        try {
            const { email, code } = req.body;
            if (!email || !code) return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });

            const safeEmail = String(email).trim();
            const safeCode = String(code).trim();

            const otp = await Otp.findOne({ email: safeEmail, code: safeCode, purpose: 'password-reset' });
            if (!otp || otp.expiresAt < new Date()) {
                return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
            }

            // Delete used OTP
            await Otp.deleteOne({ email: safeEmail, purpose: 'password-reset' });

            // Issue short-lived reset token (5 minutes)
            const resetSecret = getResetTokenSecret();
            const resetToken = jwt.sign(
                { email: safeEmail, purpose: 'password-reset', jti: crypto.randomBytes(8).toString('hex') },
                resetSecret,
                { expiresIn: '5m' }
            );

            res.json({ success: true, resetToken });
        } catch (error) {
            console.error("OTP 검증 에러:", error);
            res.status(500).json({ success: false, message: '오류가 발생했습니다.' });
        }
    }

    // Step 3: reset 토큰으로 새 비밀번호 설정
    async resetPassword(req, res) {
        try {
            const { resetToken, newPassword } = req.body;
            if (!resetToken || !newPassword) return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });

            if (newPassword.length < 6) {
                return res.status(400).json({ success: false, message: '비밀번호는 최소 6자 이상이어야 합니다.' });
            }

            const resetSecret = getResetTokenSecret();
            let decoded;
            try {
                decoded = jwt.verify(resetToken, resetSecret);
            } catch (_) {
                return res.status(400).json({ success: false, message: '재설정 토큰이 유효하지 않거나 만료되었습니다.' });
            }

            if (decoded.purpose !== 'password-reset') {
                return res.status(400).json({ success: false, message: '유효하지 않은 토큰입니다.' });
            }

            const user = await User.findOne({ email: decoded.email });
            if (!user) {
                // Respond as success to avoid email enumeration
                return res.json({ success: true });
            }

            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();

            res.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' });
        } catch (error) {
            console.error("비밀번호 재설정 에러:", error);
            res.status(500).json({ success: false, message: '오류가 발생했습니다.' });
        }
    }

    // ──────────────────────────────────────────────
    // 비밀번호 변경 (Change Password – authenticated)
    // ──────────────────────────────────────────────
    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword, confirmPassword } = req.body;
            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });
            }
            if (newPassword !== confirmPassword) {
                return res.status(400).json({ success: false, message: '새 비밀번호가 일치하지 않습니다.' });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({ success: false, message: '비밀번호는 최소 6자 이상이어야 합니다.' });
            }

            const user = await User.findById(req.user._id);
            if (!user || !user.password) {
                return res.status(400).json({ success: false, message: '소셜 로그인 계정은 비밀번호 변경을 사용할 수 없습니다.' });
            }

            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: '현재 비밀번호가 올바르지 않습니다.' });
            }

            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();

            res.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' });
        } catch (error) {
            console.error("비밀번호 변경 에러:", error);
            res.status(500).json({ success: false, message: '오류가 발생했습니다.' });
        }
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

            // ✅ 수정: 세션에 role 포함 (관리자 판별용)
            req.session.user = { 
                id: user._id, 
                username: user.username, 
                email: user.email,
                steamId: user.steamId,
                role: user.role
            };
            
            if (rememberMe) req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
            res.json({ success: true, user: req.session.user });
        } catch (e) {
            res.status(500).json({ success: false });
        }
    }

    // ✅ 수정: role이 없는 기존 세션/소셜로그인 세션도 DB에서 role 보강
    async checkStatus(req, res) {
        try {
            const sessionUser = req.session?.user;

            if (!sessionUser) {
                return res.json({ isAuthenticated: false, user: null });
            }

            // 이미 role이 있으면 그대로
            if (sessionUser.role) {
                return res.json({ isAuthenticated: true, user: sessionUser });
            }

            // role이 없으면 DB에서 가져와서 세션도 업데이트
            const dbUser = await User.findById(sessionUser.id).select('role');
            if (!dbUser) {
                return res.json({ isAuthenticated: false, user: null });
            }

            const patchedUser = { ...sessionUser, role: dbUser.role };
            req.session.user = patchedUser;

            return res.json({ isAuthenticated: true, user: patchedUser });
        } catch (e) {
            console.error('인증 상태 확인 실패:', e);
            return res.status(500).json({ isAuthenticated: false, user: null });
        }
    }

    logout(req, res) {
        req.session.destroy(() => {
            res.clearCookie('connect.sid').json({ success: true });
        });
    }
}

module.exports = new AuthController();
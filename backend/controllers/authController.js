const User = require('../models/User');
const Otp = require('../models/Otp');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); 
const axios = require('axios'); // ★ 스팀 API 통신을 위해 추가됨

class AuthController {
    sendOtp = async (req, res) => {
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

    verifyOtp = async (req, res) => {
        const { email, code } = req.body;
        const otp = await Otp.findOne({ email, code });
        if (!otp || otp.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
        }
        res.json({ success: true });
    }

    signup = async (req, res) => {
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

    _sendOtpWithPurpose = async (email, purpose, subject, text) => {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 600000); // 10분

        await Otp.findOneAndUpdate(
            { email, purpose },
            { code, expiresAt },
            { upsert: true, new: true }
        );

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: `"AuraProject" <${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            text: text.replace('{code}', code),
        });
    }

    sendFindUsernameOtp = async (req, res) => {
        try {
            const { email } = req.body;
            const userExists = await User.exists({ email });

            if (userExists) {
                await this._sendOtpWithPurpose(
                    email,
                    'find-username',
                    '[AuraProject] 아이디 찾기 인증 코드',
                    '아이디 찾기 인증번호는 [{code}] 입니다.'
                );
            }

            return res.json({ success: true, message: '인증 코드가 발송되었습니다.' });
        } catch (error) {
            console.error('아이디 찾기 OTP 발송 에러:', error);
            return res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.' });
        }
    }

    _maskUsername = (username) => {
        if (!username) return '';
        if (username.length <= 2) return username[0] + '*';
        const start = username.slice(0, 2);
        const end = username.slice(-2);
        return `${start}${'*'.repeat(Math.max(2, username.length - 4))}${end}`;
    }

    verifyFindUsernameOtp = async (req, res) => {
        try {
            const { email, code } = req.body;

            const otp = await Otp.findOne({ email, purpose: 'find-username', code });
            if (!otp || otp.expiresAt < new Date()) {
                return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
            }

            await Otp.deleteOne({ _id: otp._id });

             const users = await User.find({ email }).select('username');
            const usernames = users.map(u => u.username);
            return res.json({ success: true, usernames });
        } catch (error) {
            console.error('아이디 찾기 OTP 검증 에러:', error);
            return res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.' });
        }
    }

    sendResetPasswordOtp = async (req, res) => {
        try {
            const { email, username } = req.body;
            const query = username ? { email, username } : { email };
            const userExists = await User.exists(query);

            if (userExists) {
                await this._sendOtpWithPurpose(
                    email,
                    'reset-password',
                    '[AuraProject] 비밀번호 재설정 인증 코드',
                    '비밀번호 재설정 인증번호는 [{code}] 입니다.'
                );
            }

            return res.json({ success: true, message: '인증 코드가 발송되었습니다.' });
        } catch (error) {
            console.error('비밀번호 재설정 OTP 발송 에러:', error);
            return res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.' });
        }
    }

    verifyResetPasswordOtp = async (req, res) => {
        try {
            const { email, code, username } = req.body;

            const otp = await Otp.findOne({ email, purpose: 'reset-password', code });
            if (!otp || otp.expiresAt < new Date()) {
                return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
            }

            await Otp.deleteOne({ _id: otp._id });

            const query = username ? { email, username } : { email };
            const user = await User.findOne(query);
            
            if (!user) {
                return res.json({ success: true, resetToken: null });
            }

            const resetToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

            user.passwordResetTokenHash = tokenHash;
            user.passwordResetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 20); // 20분
            await user.save();

            return res.json({ success: true, resetToken });
        } catch (error) {
            console.error('비밀번호 재설정 OTP 검증 에러:', error);
            return res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.' });
        }
    }

    confirmResetPassword = async (req, res) => {
        try {
            const { resetToken, newPassword } = req.body;
            if (!resetToken || !newPassword) {
                return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });
            }

            const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

            const user = await User.findOne({
                passwordResetTokenHash: tokenHash,
                passwordResetTokenExpiresAt: { $gt: new Date() },
            });

            if (!user) {
                return res.status(400).json({ success: false, message: '토큰이 만료되었거나 유효하지 않습니다.' });
            }

            user.password = await bcrypt.hash(newPassword, 10);
            user.passwordResetTokenHash = undefined;
            user.passwordResetTokenExpiresAt = undefined;
            await user.save();

            return res.json({ success: true, message: '비밀번호가 변경되었습니다.' });
        } catch (error) {
            console.error('비밀번호 재설정 confirm 에러:', error);
            return res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.' });
        }
    }

    changePassword = async (req, res) => {
        try {
            const sessionUser = req.session?.user;
            if (!sessionUser?.id) {
                return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
            }

            const { currentPassword, newPassword } = req.body;
            if (!currentPassword || !newPassword) {
                return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });
            }

            const user = await User.findById(sessionUser.id);
            if (!user) {
                return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
            }

            if (!user.password) {
                return res.status(400).json({
                    success: false,
                    message: '소셜 로그인 계정은 비밀번호가 없습니다. 비밀번호 찾기에서 새 비밀번호를 설정하세요.'
                });
            }

            const ok = await bcrypt.compare(currentPassword, user.password);
            if (!ok) {
                return res.status(400).json({ success: false, message: '현재 비밀번호가 일치하지 않습니다.' });
            }

            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();

            return res.json({ success: true, message: '비밀번호가 변경되었습니다.' });
        } catch (error) {
            console.error('비밀번호 변경 에러:', error);
            return res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.' });
        }
    }

    login = async (req, res) => {
        try {
            const { username, password, rememberMe } = req.body;
            const user = await User.findOne({ username });
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
            }

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

    checkStatus = async (req, res) => {
        try {
            const sessionUser = req.session?.user;

            if (!sessionUser) {
                return res.json({ isAuthenticated: false, user: null });
            }

            if (sessionUser.role) {
                return res.json({ isAuthenticated: true, user: sessionUser });
            }

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

    logout = (req, res) => {
        req.session.destroy(() => {
            res.clearCookie('connect.sid').json({ success: true });
        });
    }

    // ★ 3단계 분기 로직 적용: 초심자(beginner), 중급자(intermediate), 스트리머(streamer)
    syncSteamGames = async (userId, steamId) => {
        try {
            const apiKey = process.env.STEAM_API_KEY;
            const response = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v1/`, {
                params: {
                    key: apiKey,
                    steamid: steamId,
                    include_appinfo: true,
                    format: 'json'
                }
            });

            const games = response.data.response.games || [];
            
            const totalGames = games.length;
            let totalPlaytimeMinutes = 0;
            let maxSinglePlaytime = 0;

            // 총 플레이타임 합산 및 단일 게임 최대 플레이타임 추출
            games.forEach(game => {
                const pt = game.playtime_forever || 0;
                totalPlaytimeMinutes += pt;
                if (pt > maxSinglePlaytime) maxSinglePlaytime = pt;
            });

            let newPlayerType = 'beginner'; // 기본값

            // 기준 1: 스트리머 - 단일 게임 5000시간(300,000분) 이상 OR 게임 500개 이상
            if (maxSinglePlaytime >= 300000 || totalGames >= 500) {
                newPlayerType = 'streamer';
            } 
            // 기준 2: 중급자 - 총 플레이타임 300시간(18,000분) 이상 OR 게임 50개 이상
            else if (totalPlaytimeMinutes >= 18000 || totalGames >= 50) {
                newPlayerType = 'intermediate';
            }

            // 유저 DB 업데이트 시 playerType 함께 갱신
            await User.findByIdAndUpdate(userId, {
                steamGames: games.map(g => ({
                    appid: g.appid,
                    name: g.name,
                    playtime_forever: g.playtime_forever,
                    img_icon_url: g.img_icon_url
                })),
                playerType: newPlayerType
            });

            return { success: true, type: newPlayerType };
        } catch (error) {
            console.error("Steam Sync Error:", error);
            throw error;
        }
    }
}

module.exports = new AuthController();
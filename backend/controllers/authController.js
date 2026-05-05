const User = require('../models/User');
const Game = require('../models/Game');
const Otp = require('../models/Otp');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); 
const axios = require('axios'); 

class AuthController {
    sendOtp = async (req, res) => {
        try {
            const { email } = req.body;
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 600000); 

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
        const expiresAt = new Date(Date.now() + 600000); 

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
            user.passwordResetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 20); 
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

            // ★ 세션에 스팀 보유 게임 배열과 유저 등급 동기화
            req.session.user = { 
                id: user._id, 
                username: user.username, 
                displayName: user.displayName,
                email: user.email,
                steamId: user.steamId,
                role: user.role,
                playerType: user.playerType || 'beginner',
                steamGames: user.steamGames || []
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

            // DB에서 최신 역할, 플레이어 등급, 스팀 라이브러리 데이터를 당겨옵니다.
            const dbUser = await User.findById(sessionUser.id).select('role playerType steamGames');
            if (!dbUser) {
                return res.json({ isAuthenticated: false, user: null });
            }

            const patchedUser = { 
                ...sessionUser, 
                role: dbUser.role,
                playerType: dbUser.playerType || 'beginner',
                steamGames: dbUser.steamGames || []
            };
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

            games.forEach(game => {
                const pt = game.playtime_forever || 0;
                totalPlaytimeMinutes += pt;
                if (pt > maxSinglePlaytime) maxSinglePlaytime = pt;
            });

            // 유저가 직접 설정했으면 자동분류 안 함
            const existingUser = await User.findById(userId).select('playerTypeSetByUser').lean();
            let newPlayerType = 'beginner';

            if (!existingUser?.playerTypeSetByUser) {
                // 자동 분류 기준 (Steam 연동 시에만)
                // casual: 게임 5개 미만, 총 플레이 5시간 미만
                // beginner: 기본값
                // intermediate: 총 300시간 이상 or 게임 50개 이상
                // hardcore: 총 1000시간 이상 or 단일게임 500시간 이상
                // streamer: 직접 설정만 가능 (자동분류 제외)
                if (totalPlaytimeMinutes >= 60000 || maxSinglePlaytime >= 30000) {
                    newPlayerType = 'hardcore';
                } else if (totalPlaytimeMinutes >= 18000 || totalGames >= 50) {
                    newPlayerType = 'intermediate';
                } else if (totalGames < 5 && totalPlaytimeMinutes < 300) {
                    newPlayerType = 'casual';
                } else {
                    newPlayerType = 'beginner';
                }
            } else {
                // 유저가 직접 설정한 경우 기존 값 유지
                newPlayerType = existingUser.playerType || 'beginner';
            }

            // DB에서 Steam 게임들의 smart_tags 일괄 조회
            const appIds = games.map(g => g.appid);
            const dbGames = await Game.find({ steam_appid: { $in: appIds } })
                .select('steam_appid smart_tags')
                .lean();
            const tagMap = {};
            dbGames.forEach(g => { tagMap[g.steam_appid] = g.smart_tags || []; });

            await User.findByIdAndUpdate(userId, {
                steamGames: games.map(g => ({
                    appid: g.appid,
                    name: g.name,
                    playtime_forever: g.playtime_forever,
                    img_icon_url: g.img_icon_url,
                    smart_tags: tagMap[g.appid] || []  // DB 태그 주입
                })),
                ...(existingUser?.playerTypeSetByUser ? {} : { playerType: newPlayerType })
            });

            return { success: true, type: newPlayerType };
        } catch (error) {
            console.error("Steam Sync Error:", error);
            throw error;
        }
    }
}

module.exports = new AuthController();
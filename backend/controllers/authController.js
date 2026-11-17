const User = require('../models/User');
const Game = require('../models/Game');
const Otp = require('../models/Otp');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); 
const axios = require('axios'); 

// ── OTP 공통 설정 ─────────────────────────────────────────────────────────────
const OTP_TTL_MS = 10 * 60 * 1000;          // 인증코드 유효시간 10분
const OTP_MAX_ATTEMPTS = 5;                 // 코드 하나당 최대 검증 시도 횟수 (무차별 대입 방지)
const SIGNUP_TOKEN_TTL_MS = 15 * 60 * 1000; // 이메일 인증 후 가입 완료까지 허용 시간

// 요청 값이 문자열일 때만 사용 (객체/배열이 오면 빈 문자열 → NoSQL Injection 2차 방어)
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
// Math.random()은 예측 가능 → 암호학적으로 안전한 난수 사용
const generateOtpCode = () => crypto.randomInt(100000, 1000000).toString();

const safeEqual = (a, b) => {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/**
 * OTP 검증 + 1회용 소비
 * - 코드를 쿼리 조건에 넣지 않고 (email, purpose)로 문서를 찾은 뒤 서버에서 비교
 * - 실패할 때마다 attempts 증가, 한도 초과 시 코드 폐기
 * @returns {Promise<boolean>}
 */
async function consumeOtp(email, purpose, code) {
    if (!email || !/^\d{6}$/.test(code)) return false;

    const otp = await Otp.findOne({ email, purpose });
    if (!otp || otp.expiresAt < new Date()) return false;

    if (!safeEqual(otp.code, code)) {
        const attempts = (otp.attempts || 0) + 1;
        if (attempts >= OTP_MAX_ATTEMPTS) {
            await Otp.deleteOne({ _id: otp._id });
        } else {
            await Otp.updateOne({ _id: otp._id }, { $set: { attempts } });
        }
        return false;
    }

    await Otp.deleteOne({ _id: otp._id }); // 1회용: 인증 완료 후 즉시 삭제
    return true;
}

class AuthController {
    sendOtp = async (req, res) => {
        try {
            const email = str(req.body.email);
            const username = str(req.body.username);
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ success: false, message: '올바른 이메일 형식이 아닙니다.' });
            }

            // 가입 전 중복 체크 (인증코드 보내기 전에 미리 거름 - UX 개선)
            if (email) {
                const existsEmail = await User.findOne({ email });
                if (existsEmail) return res.status(400).json({ success: false, message: '이미 가입된 이메일입니다.' });
            }
            if (username) {
                const existsUser = await User.findOne({ username });
                if (existsUser) return res.status(400).json({ success: false, message: '이미 사용 중인 아이디입니다.' });
            }

            const code = generateOtpCode();
            const expiresAt = new Date(Date.now() + OTP_TTL_MS);

            // 재발송 시 시도 횟수도 초기화
            await Otp.findOneAndUpdate({ email, purpose: 'signup' }, { code, expiresAt, attempts: 0 }, { upsert: true });

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
        try {
            const email = str(req.body.email);
            const code = str(req.body.code);

            const ok = await consumeOtp(email, 'signup', code);
            if (!ok) {
                return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
            }

            // 이메일 인증 완료 증표: 가입 API에서 반드시 제출해야 하는 1회용 토큰
            // (DB에는 해시만 저장 — 재설정 토큰과 같은 방식)
            const signupToken = crypto.randomBytes(32).toString('hex');
            await Otp.findOneAndUpdate(
                { email, purpose: 'signup-verified' },
                { code: sha256(signupToken), expiresAt: new Date(Date.now() + SIGNUP_TOKEN_TTL_MS), attempts: 0 },
                { upsert: true }
            );

            res.json({ success: true, signupToken });
        } catch (error) {
            console.error('OTP 검증 에러:', error);
            res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.' });
        }
    }

    signup = async (req, res) => {
        try {
            const username = str(req.body.username);
            const email = str(req.body.email);
            const signupToken = str(req.body.signupToken);
            const password = typeof req.body.password === 'string' ? req.body.password : '';

            // 입력값 검증
            if (!username || username.length < 3)
                return res.status(400).json({ success: false, message: '아이디는 3자 이상이어야 합니다.' });
            if (!password || password.length < 8)
                return res.status(400).json({ success: false, message: '비밀번호는 8자 이상이어야 합니다.' });
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                return res.status(400).json({ success: false, message: '올바른 이메일 형식이 아닙니다.' });

            // 아이디 중복 확인
            const existingUser = await User.findOne({ username });
            if (existingUser) return res.status(400).json({ success: false, message: '이미 사용 중인 아이디입니다.' });

            // 이메일 중복 확인
            const existingEmail = await User.findOne({ email });
            if (existingEmail) return res.status(400).json({ success: false, message: '이미 가입된 이메일입니다.' });

            // 이메일 인증 여부 확인: /verify-otp 에서 받은 토큰이 없으면 가입 불가
            // (없으면 남의 이메일로 가입한 뒤 소셜 로그인 자동 연결로 계정을 가로챌 수 있음)
            const verified = await Otp.findOne({ email, purpose: 'signup-verified' });
            if (!signupToken || !verified || verified.expiresAt < new Date()
                || !safeEqual(verified.code, sha256(signupToken))) {
                return res.status(400).json({ success: false, message: '이메일 인증을 먼저 완료해주세요.' });
            }
            await Otp.deleteOne({ _id: verified._id });

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = new User({ username, password: hashedPassword, email, emailVerified: true });
            await newUser.save();
            res.status(201).json({ success: true });
        } catch (e) {
            console.error('Signup Error:', e);
            res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
        }
    }

    _sendOtpWithPurpose = async (email, purpose, subject, text) => {
        const code = generateOtpCode();
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);

        await Otp.findOneAndUpdate(
            { email, purpose },
            { code, expiresAt, attempts: 0 },
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
            const email = str(req.body.email);
            if (!email) return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });
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
            const email = str(req.body.email);
            const code = str(req.body.code);

            const ok = await consumeOtp(email, 'find-username', code);
            if (!ok) {
                return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
            }

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
            const email = str(req.body.email);
            const username = str(req.body.username);
            if (!email) return res.status(400).json({ success: false, message: '이메일을 입력해주세요.' });
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
            const email = str(req.body.email);
            const code = str(req.body.code);
            const username = str(req.body.username);

            const ok = await consumeOtp(email, 'reset-password', code);
            if (!ok) {
                return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
            }

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
            const resetToken = str(req.body.resetToken);
            const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
            if (!resetToken || !newPassword) {
                return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });
            }
            if (newPassword.length < 8) {
                return res.status(400).json({ success: false, message: '비밀번호는 8자 이상이어야 합니다.' });
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

            const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
            const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
            if (!currentPassword || !newPassword) {
                return res.status(400).json({ success: false, message: '필수 값이 누락되었습니다.' });
            }
            if (newPassword.length < 8) {
                return res.status(400).json({ success: false, message: '비밀번호는 8자 이상이어야 합니다.' });
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
            const username = str(req.body.username);
            const password = typeof req.body.password === 'string' ? req.body.password : '';
            const { rememberMe } = req.body;
            if (!username || !password) {
                return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
            }
            const user = await User.findOne({ username });
            if (!user || !user.password) {
                return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
            }
            if (!(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
            }

            // 세션 고정(Session Fixation) 방지: 로그인 성공 시 세션 ID를 새로 발급
            await new Promise((resolve, reject) =>
                req.session.regenerate((err) => (err ? reject(err) : resolve())));

            // ★ 세션에 스팀 보유 게임 배열과 유저 등급 동기화
            req.session.user = { 
                id: user._id, 
                username: user.username, 
                displayName: user.displayName,
                email: user.email,
                steamId: user.steamId,
                role: user.role,
                playerType: user.playerType || 'beginner',
                playerTypeSetByUser: !!user.playerTypeSetByUser,
                steamGames: user.steamGames || []
            };
            
            if (rememberMe) req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
            res.json({ success: true, user: req.session.user });
        } catch (e) {
            console.error('Login Error:', e);
            res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
        }
    }

    checkStatus = async (req, res) => {
        try {
            const sessionUser = req.session?.user;

            if (!sessionUser) {
                return res.json({ isAuthenticated: false, user: null });
            }

            // DB에서 최신 역할, 플레이어 등급, 스팀 라이브러리 데이터를 당겨옵니다.
            const dbUser = await User.findById(sessionUser.id).select('displayName role playerType playerTypeSetByUser steamGames steamId googleId naverId password');
            if (!dbUser) {
                return res.json({ isAuthenticated: false, user: null });
            }

            const patchedUser = { 
                ...sessionUser, 
                displayName: dbUser.displayName || sessionUser.displayName,
                role: dbUser.role,
                playerType: dbUser.playerType || 'beginner',
                playerTypeSetByUser: !!dbUser.playerTypeSetByUser,
                steamGames: dbUser.steamGames || [],
                steamId: dbUser.steamId || null,
                isSocial: !!(dbUser.googleId || dbUser.naverId) || !dbUser.password  // 소셜 로그인 여부
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
            const apiKey = process.env.STEAM_WEB_API_KEY || process.env.STEAM_API_KEY;
            const response = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v1/`, {
                params: {
                    key: apiKey,
                    steamid: steamId,
                    include_appinfo: true,
                    include_played_free_games: true,
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
            const existingUser = await User.findById(userId).select('playerTypeSetByUser playerType').lean();
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
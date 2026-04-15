const User = require('../models/User');
const Otp = require('../models/Otp');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); 


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

async _sendOtpWithPurpose(email, purpose, subject, text) {
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
async sendFindUsernameOtp(req, res) {
  try {
    const { email } = req.body;

    // 이메일 존재여부 노출 방지: 항상 성공처럼 응답
    // 단, 실제로는 존재하는 이메일일 때만 메일 발송하도록 할 수도 있음(스팸방지)
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

_maskUsername(username) {
  if (!username) return '';
  if (username.length <= 2) return username[0] + '*';
  const start = username.slice(0, 2);
  const end = username.slice(-2);
  return `${start}${'*'.repeat(Math.max(2, username.length - 4))}${end}`;
}

async verifyFindUsernameOtp(req, res) {
  try {
    const { email, code } = req.body;

    const otp = await Otp.findOne({ email, purpose: 'find-username', code });
    if (!otp || otp.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
    }

    // OTP 1회용 처리(선택이지만 추천)
    await Otp.deleteOne({ _id: otp._id });

    const users = await User.find({ email }).select('username');
    // 이메일이 존재하지 않아도 동일한 형태로 응답(노출 최소화)
    const maskedUsernames = users.map(u => this._maskUsername(u.username));

    return res.json({ success: true, maskedUsernames });
  } catch (error) {
    console.error('아이디 찾기 OTP 검증 에러:', error);
    return res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.' });
  }
}
async sendResetPasswordOtp(req, res) {
  try {
    const { email, username } = req.body;

    // username을 입력받는 UX면 (email+username 일치할 때만)
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

async verifyResetPasswordOtp(req, res) {
  try {
    const { email, code, username } = req.body;

    const otp = await Otp.findOne({ email, purpose: 'reset-password', code });
    if (!otp || otp.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: '인증코드가 틀리거나 만료되었습니다.' });
    }

    await Otp.deleteOne({ _id: otp._id });

    // user 찾기
    const query = username ? { email, username } : { email };
    const user = await User.findOne(query);
    // 존재여부 노출 최소화: 여기서도 똑같이 처리(그냥 성공으로 내려도 됨)
    if (!user) {
      return res.json({ success: true, resetToken: null });
    }

    // resetToken 발급(원문은 1번만 보여주고, DB엔 해시 저장)
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

async confirmResetPassword(req, res) {
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
async changePassword(req, res) {
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

    // 소셜 계정만 있는 경우(비번 없음)
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
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const normalizeId = (value) => {
  if (!value) return null;

  // value가 ObjectId거나, toString 가능한 객체면 문자열로
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const s = value.toString();
    return s && s !== '[object Object]' ? s : null;
  }

  if (typeof value === 'string') return value;

  return null;
};

const loadUserFromDb = async (userId) => {
  const id = normalizeId(userId);
  if (!id) return null;
  return User.findById(id).select('-password');
};

const authenticateToken = async (req, res, next) => {
  try {
    // 1) Passport 세션 인증 (예: OAuth/Steam 등)
    if (req.isAuthenticated && req.isAuthenticated()) {
      const passportUser = req.user;

      // passport deserializeUser가 반환하는 형태가 다양해서 모두 대응
      const candidateId =
        passportUser?._id ||
        passportUser?.id ||
        passportUser?.userId ||
        passportUser;

      const dbUser = await loadUserFromDb(candidateId);

      // DB 유저가 있으면 항상 DB 유저 기준으로 req.user 세팅(권한/role 보장)
      if (dbUser) {
        req.user = { ...dbUser.toObject(), _id: dbUser._id, role: dbUser.role };
      } else {
        // 혹시 db 조회가 실패해도 최소한 기존 req.user는 유지
        req.user = passportUser;
      }

      return next();
    }

    // 2) 자체 로그인 세션 인증 (req.session.user 사용)
    if (req.session && req.session.user) {
      const sessionUser = req.session.user;
      const candidateId = sessionUser.id || sessionUser._id;

      const dbUser = await loadUserFromDb(candidateId);

      if (dbUser) {
        req.user = { ...dbUser.toObject(), _id: dbUser._id, role: dbUser.role };
      } else {
        // session.user만 있는 경우(예: 세션 구조 변경/임시값)에도 최대한 유지
        req.user = { ...sessionUser, _id: candidateId };
      }

      return next();
    }

    // 3) JWT 쿠키 인증 (token 쿠키)
    const token = req.cookies?.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');

      const dbUser = await loadUserFromDb(decoded.id);

      if (dbUser) {
        req.user = { ...dbUser.toObject(), _id: dbUser._id, role: dbUser.role };
        return next();
      }

      // 토큰은 유효하지만 유저가 없는 경우
      return res.status(401).json({ message: '사용자를 찾을 수 없습니다. 다시 로그인 해주세요.' });
    }

    return res.status(401).json({ message: '인증 토큰이 없거나 로그인이 필요합니다.' });
  } catch (err) {
    console.error('Auth Middleware Error:', err);
    return res.status(403).json({ message: '토큰이 유효하지 않거나 만료되었습니다.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  next();
};

module.exports = { authenticateToken, requireAdmin };
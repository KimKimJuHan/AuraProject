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

const toReqUser = (dbUser) => ({ ...dbUser.toObject(), _id: dbUser._id, role: dbUser.role });

/**
 * 요청에서 로그인 사용자를 찾아 "DB에 실제로 존재하는" 유저만 반환한다.
 * 확인 순서: Passport 세션 → 자체 세션(req.session.user) → JWT 쿠키
 *
 * 이전에는 DB 조회에 실패해도 세션에 남은 정보로 통과시켰다.
 * → 탈퇴/삭제/차단된 계정이 세션이 살아 있는 동안 계속 로그인 상태가 되는 문제.
 * 이제는 DB에 없으면 세션을 정리하고 비로그인으로 처리한다.
 *
 * @returns {Promise<object|null>} req.user 형태의 유저 객체 또는 null
 * @throws JWT 검증 실패 시 (호출 측에서 처리)
 */
const resolveUser = async (req) => {
  // 1) Passport 세션 인증 (OAuth/Steam)
  if (req.isAuthenticated && req.isAuthenticated()) {
    const passportUser = req.user;
    const candidateId =
      passportUser?._id || passportUser?.id || passportUser?.userId || passportUser;
    const dbUser = await loadUserFromDb(candidateId);
    if (dbUser) return toReqUser(dbUser);
    clearStaleSession(req);
    return null;
  }

  // 2) 자체 로그인 세션
  if (req.session && req.session.user) {
    const sessionUser = req.session.user;
    const dbUser = await loadUserFromDb(sessionUser.id || sessionUser._id);
    if (dbUser) return toReqUser(dbUser);
    clearStaleSession(req);
    return null;
  }

  // 3) JWT 쿠키
  const token = req.cookies?.token;
  if (token) {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const dbUser = await loadUserFromDb(decoded.id);
    return dbUser ? toReqUser(dbUser) : null;
  }

  return null;
};

// DB에 없는 유저의 세션 정보 제거 (다음 요청부터는 비로그인)
const clearStaleSession = (req) => {
  if (req.session) delete req.session.user;
  if (req.session?.passport) delete req.session.passport;
  req.user = undefined;
};

/** 로그인 필수 라우트용 */
const authenticateToken = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ message: '로그인이 필요합니다. 다시 로그인 해주세요.' });
    }
    req.user = user;
    return next();
  } catch (err) {
    console.error('Auth Middleware Error:', err.message);
    return res.status(403).json({ message: '토큰이 유효하지 않거나 만료되었습니다.' });
  }
};

/**
 * 로그인 선택 라우트용 (비로그인도 허용, 로그인 상태면 req.user 세팅)
 * 추천 API처럼 게스트도 쓰지만, 개인화는 "본인" 데이터로만 해야 하는 곳에 사용.
 */
const optionalAuth = async (req, _res, next) => {
  try {
    req.user = (await resolveUser(req)) || undefined;
  } catch (_err) {
    req.user = undefined; // 토큰이 깨졌으면 게스트로 처리
  }
  return next();
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  next();
};

module.exports = { authenticateToken, optionalAuth, requireAdmin, resolveUser };
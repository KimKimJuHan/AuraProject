const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const jwt = require('jsonwebtoken');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/status', authController.checkStatus);
router.post('/logout', authController.logout);
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);

// 구글
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    req.session.user = {
      id: req.user._id,
      username: req.user.username,
      displayName: req.user.displayName,
      email: req.user.email,
      avatar: req.user.avatar,
      role: req.user.role, // ✅ 추가
    };
    const redirectUrl = process.env.FRONTEND_URL || 'https://playforyou.net';
    res.redirect(redirectUrl);
  }
);

// 네이버
router.get('/naver', passport.authenticate('naver'));
router.get(
  '/naver/callback',
  passport.authenticate('naver', { failureRedirect: '/login' }),
  (req, res) => {
    req.session.user = {
      id: req.user._id,
      username: req.user.username,
      displayName: req.user.displayName,
      email: req.user.email,
      avatar: req.user.avatar,
      role: req.user.role, // ✅ 추가
    };
    const redirectUrl = process.env.FRONTEND_URL || 'https://playforyou.net';
    res.redirect(redirectUrl);
  }
);

// ★ 스팀 연동 (수정됨: 로그인 유저 식별 작업 포함)
router.get(
  '/steam',
  (req, res, next) => {
    // 세션 또는 JWT 쿠키를 확인하여 '현재 누구의 계정에 스팀을 연동하려는지'를 session에 임시 기록합니다.
    const token = req.cookies?.token;
    if (req.session && req.session.user) {
      req.session.steamLinkingUserId = req.session.user.id;
    } else if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        req.session.steamLinkingUserId = decoded.id;
      } catch (e) {}
    }
    next();
  },
  passport.authenticate('steam')
);

router.get(
  '/steam/return',
  passport.authenticate('steam', { failureRedirect: '/login' }),
  (req, res) => {
    // 스팀 연동이 끝난 후, 덮어씌워지지 않게 유저 세션을 정상 객체로 복원합니다.
    req.session.user = {
      id: req.user._id,
      username: req.user.username,
      displayName: req.user.displayName,
      email: req.user.email,
      avatar: req.user.avatar,
      role: req.user.role, // ✅ 추가
    };
    const redirectUrl = process.env.FRONTEND_URL || 'https://playforyou.net';
    res.redirect(redirectUrl);
  }
);

module.exports = router;
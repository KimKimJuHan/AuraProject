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

router.post('/find-username/send-otp', authController.sendFindUsernameOtp);
router.post('/find-username/verify-otp', authController.verifyFindUsernameOtp);

router.post('/reset-password/send-otp', authController.sendResetPasswordOtp);
router.post('/reset-password/verify-otp', authController.verifyResetPasswordOtp);
router.post('/reset-password/confirm', authController.confirmResetPassword);     

router.post('/change-password', authController.changePassword);

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
      role: req.user.role,
    };
    const redirectUrl = process.env.FRONTEND_URL || 'https://playforyou.net';
    res.redirect(redirectUrl);
  }
);

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
      role: req.user.role, 
    };
    const redirectUrl = process.env.FRONTEND_URL || 'https://playforyou.net';
    res.redirect(redirectUrl);
  }
);

router.get(
  '/steam',
  (req, res, next) => {
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
    req.session.user = {
      id: req.user._id,
      username: req.user.username,
      displayName: req.user.displayName,
      email: req.user.email,
      avatar: req.user.avatar,
      role: req.user.role, 
    };
    const redirectUrl = process.env.FRONTEND_URL || 'https://playforyou.net';
    res.redirect(redirectUrl);
  }
);

module.exports = router;
// backend/routes/auth.js
const express = require('express');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');

// 스팀 로그인 진입점
router.get('/steam', passport.authenticate('steam', { failureRedirect: '/' }));

// 스팀 로그인 콜백 (스팀 서버에서 돌아오는 곳)
router.get('/steam/return', 
    passport.authenticate('steam', { failureRedirect: '/' }), 
    authController.steamCallback
);

// 로그인 상태 체크 (프론트에서 항상 호출)
router.get('/status', authController.checkStatus);

// 로그아웃
router.post('/logout', authController.logout);

module.exports = router;
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 자체 회원가입 및 로그인 라우트
router.post('/signup', authController.signup);
router.post('/login', authController.login);

// 세션 상태 확인 및 로그아웃
router.get('/status', authController.checkStatus);
router.post('/logout', authController.logout);

module.exports = router;
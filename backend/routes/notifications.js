const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// 세션 기반 로그인 확인 미들웨어
const requireAuth = (req, res, next) => {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    req.userId = userId;
    next();
};

// 1. 내 알림 목록 불러오기 (최신순 30개)
router.get('/', requireAuth, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();
        res.json({ success: true, notifications });
    } catch (err) {
        console.error("알림 조회 에러:", err);
        res.status(500).json({ success: false });
    }
});

// 2. 알림 모두 읽음 처리
router.post('/read', requireAuth, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.userId, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ success: true });
    } catch (err) {
        console.error("알림 읽음 처리 에러:", err);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
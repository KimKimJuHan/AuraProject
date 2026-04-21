const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/auth');

// 1. 내 모든 알림 조회 (최신순)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
                                              .sort({ createdAt: -1 })
                                              .lean();
        res.json({ success: true, notifications });
    } catch (err) {
        console.error("알림 조회 에러:", err);
        res.status(500).json({ success: false, message: "알림 조회 실패" });
    }
});

// 2. 미확인 알림 개수 조회 (종 모양 숫자 배지용)
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ 
            userId: req.user._id, 
            isRead: false 
        });
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 3. 특정 알림 읽음 처리
router.patch('/:id/read', authenticateToken, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: { isRead: true } },
            { new: true }
        );
        if (!notification) return res.status(404).json({ success: false });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 4. 안 읽은 알림 모두 읽음 처리
router.post('/read-all', authenticateToken, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user._id, isRead: false }, 
            { $set: { isRead: true } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 5. 특정 알림 삭제
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const result = await Notification.deleteOne({ 
            _id: req.params.id, 
            userId: req.user._id 
        });
        if (result.deletedCount === 0) return res.status(404).json({ success: false });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 6. 모든 알림 비우기
router.delete('/', authenticateToken, async (req, res) => {
    try {
        await Notification.deleteMany({ userId: req.user._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const Inquiry = require('../models/Inquiry');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// 헬스체크
router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'support' });
});

/**
 * FAQ 목록 (프론트 에러 방지용 - 아직 DB 없으면 빈 배열)
 * GET /api/support/faqs
 */
router.get('/faqs', (req, res) => {
  res.json({ success: true, faqs: [] });
});

/**
 * [USER] 문의 생성
 * POST /api/support/inquiries
 * body: { category, title, content }
 */
router.post('/inquiries', authenticateToken, async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const { category = 'etc', title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'title/content는 필수입니다.' });
    }

    const inquiry = await Inquiry.create({
      userId: req.user._id,
      category,
      title,
      content,
      status: 'open',
      answer: '',
    });

    return res.status(201).json({ success: true, inquiry });
  } catch (err) {
    console.error('Create Inquiry Error:', err);
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * [USER] 내 문의 목록 (프론트 호환: /me)
 * GET /api/support/inquiries/me
 */
router.get('/inquiries/me', authenticateToken, async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const inquiries = await Inquiry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, inquiries });
  } catch (err) {
    console.error('My Inquiries(me) Error:', err);
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * [USER] 내 문의 목록 (기존 호환: /my)
 * GET /api/support/inquiries/my
 */
router.get('/inquiries/my', authenticateToken, async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }

    const inquiries = await Inquiry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, inquiries });
  } catch (err) {
    console.error('My Inquiries(my) Error:', err);
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * [USER] 내 문의 상세
 * GET /api/support/inquiries/:id
 * - ObjectId(24 hex)만 매칭되게 제한해서 /me 같은 경로가 여기로 안 들어오게 함
 */
router.get('/inquiries/:id([0-9a-fA-F]{24})', authenticateToken, async (req, res) => {
  try {
    const inquiryId = req.params.id;

    // 안전장치(정규식이 있지만 혹시 몰라서)
    if (!mongoose.Types.ObjectId.isValid(inquiryId)) {
      return res.status(400).json({ success: false, message: '잘못된 문의 ID입니다.' });
    }

    const inquiry = await Inquiry.findById(inquiryId).lean();
    if (!inquiry) return res.status(404).json({ success: false, message: '문의가 없습니다.' });

    const isOwner = inquiry.userId?.toString?.() === req.user._id?.toString?.();
    const isAdmin = req.user?.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    return res.json({ success: true, inquiry });
  } catch (err) {
    console.error('Inquiry Detail Error:', err);
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * [ADMIN] 전체 문의 목록(필터/페이지 옵션)
 * GET /api/support/admin/inquiries?status=open&category=steam&page=1&limit=20
 */
router.get('/admin/inquiries', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, category } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [total, inquiries] = await Promise.all([
      Inquiry.countDocuments(filter),
      Inquiry.find(filter)
        .populate('userId', 'username displayName email role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.json({ success: true, page, limit, total, inquiries });
  } catch (err) {
    console.error('Admin Inquiries Error:', err);
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * [ADMIN] 문의 답변 등록/수정 + status answered로 변경
 * PATCH /api/support/admin/inquiries/:id/answer
 * body: { answer }
 */
router.patch('/admin/inquiries/:id([0-9a-fA-F]{24})/answer', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { answer = '' } = req.body;

    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: '문의가 없습니다.' });

    inquiry.answer = answer;
    if (answer && answer.trim().length > 0) inquiry.status = 'answered';
    await inquiry.save();

    return res.json({ success: true, inquiry });
  } catch (err) {
    console.error('Admin Answer Error:', err);
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * [ADMIN] 문의 상태 변경(open/answered/closed)
 * PATCH /api/support/admin/inquiries/:id/status
 * body: { status }
 */
router.patch('/admin/inquiries/:id([0-9a-fA-F]{24})/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'answered', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status 값이 올바르지 않습니다.' });
    }

    const inquiry = await Inquiry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();

    if (!inquiry) return res.status(404).json({ success: false, message: '문의가 없습니다.' });

    return res.json({ success: true, inquiry });
  } catch (err) {
    console.error('Admin Status Error:', err);
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
});

module.exports = router;
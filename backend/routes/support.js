const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const Faq = require('../models/Faq');
const Inquiry = require('../models/Inquiry');

/** FAQ (비로그인 가능) */
router.get('/faqs', async (req, res) => {
  const faqs = await Faq.find({ isActive: true }).sort({ order: 1, createdAt: -1 }).lean();
  res.json(faqs);
});

router.get('/faqs/:id', async (req, res) => {
  const faq = await Faq.findById(req.params.id).lean();
  if (!faq || faq.isActive === false) return res.status(404).json({ message: 'FAQ not found' });
  res.json(faq);
});

/** 1:1 문의 (로그인 필요) */
router.post('/inquiries', authenticateToken, async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ message: 'title/content required' });

  const inquiry = await Inquiry.create({
    userId: req.user._id,
    title,
    content,
  });

  res.status(201).json(inquiry);
});

router.get('/inquiries/me', authenticateToken, async (req, res) => {
  const list = await Inquiry.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();
  res.json(list);
});

router.get('/inquiries/:id', authenticateToken, async (req, res) => {
  const inquiry = await Inquiry.findById(req.params.id).lean();
  if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });
  if (String(inquiry.userId) !== String(req.user._id)) return res.status(403).json({ message: 'Forbidden' });
  res.json(inquiry);
});

router.post('/inquiries', authenticateToken, async (req, res) => {
  const { category, title, content } = req.body;
  if (!title || !content) return res.status(400).json({ message: 'title/content required' });

  const allowed = ['account', 'recommend', 'steam', 'bug', 'etc'];
  if (category && !allowed.includes(category)) {
    return res.status(400).json({ message: 'invalid category' });
  }
  
  router.post('/faqs', async (req, res) => {
  const { category, question, answer, order, isActive } = req.body;
  if (!question || !answer) return res.status(400).json({ message: 'question/answer required' });

  const faq = await Faq.create({
    category: category || '일반',
    question,
    answer,
    order: typeof order === 'number' ? order : 0,
    isActive: typeof isActive === 'boolean' ? isActive : true,
  });

  res.status(201).json(faq);
});f
  const inquiry = await Inquiry.create({
    userId: req.user._id,
    category: category || 'etc',
    title,
    content,
  });

  res.status(201).json(inquiry);
});

module.exports = router;
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['SALE', 'INFO', 'SYSTEM'], default: 'SALE' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    gameSlug: { type: String }, // 클릭 시 해당 게임 페이지로 이동하기 위함
    discountPercent: { type: Number },
    isRead: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
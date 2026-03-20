const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String },
    steamId: { type: String } // 추후 연동을 위해 예약
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
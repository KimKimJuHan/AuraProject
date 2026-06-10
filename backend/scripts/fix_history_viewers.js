const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const TrendHistory = mongoose.model('TrendHistory', new mongoose.Schema({
        steam_appid: Number,
        twitch_viewers: Number,
        chzzk_viewers: Number,
        soop_viewers: Number,
        recordedAt: Date
    }, { strict: false }), 'trend_history');

    const histories = await TrendHistory.find({
        twitch_viewers: { $gt: 0 },
        $or: [
            { chzzk_viewers: { $exists: false } },
            { chzzk_viewers: 0 }
        ]
    });

    let count = 0;
    for (const h of histories) {
        h.chzzk_viewers = Math.floor(h.twitch_viewers * 0.15);
        h.soop_viewers = Math.floor(h.twitch_viewers * 0.05);
        await h.save();
        count++;
    }
    console.log(`Backfilled ${count} trend histories`);
    process.exit(0);
});

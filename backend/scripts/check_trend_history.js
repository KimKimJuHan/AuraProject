const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const TrendHistory = require('../models/TrendHistory');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const count = await TrendHistory.countDocuments();
    const latest = await TrendHistory.findOne().sort({ recordedAt: -1 }).lean();
    const oldest = await TrendHistory.findOne().sort({ recordedAt: 1 }).lean();
    console.log('Total records:', count);
    console.log('Latest:', latest?.recordedAt, '| Score:', latest?.trend_score, 'C:', latest?.chzzk_viewers, 'S:', latest?.soop_viewers);
    console.log('Oldest:', oldest?.recordedAt, '| Score:', oldest?.trend_score);
    
    // 최근 7일치 게임당 레코드 수
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = await TrendHistory.countDocuments({ recordedAt: { $gte: weekAgo } });
    console.log('Recent 7 days records:', recentCount);
    
    // 샘플: 치지직 시청자 있는 것들
    const sample = await TrendHistory.find({ chzzk_viewers: { $gt: 0 } }).sort({ recordedAt: -1 }).limit(5).lean();
    console.log('Chzzk viewer samples:');
    sample.forEach(s => console.log('  -', s.recordedAt, 'appid:', s.steam_appid, 'trend:', s.trend_score, 'C:', s.chzzk_viewers));
    
    // 고유 steam_appid 수
    const distinct = await TrendHistory.distinct('steam_appid');
    console.log('Unique game appids:', distinct.length);
    
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

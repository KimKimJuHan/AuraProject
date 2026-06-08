const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const g = await Game.findOne({ trend_score: { $gt: 100 } }).lean();
    console.log('minimum_requirements:', JSON.stringify(g.minimum_requirements));
    console.log('pc_compatibility:', JSON.stringify(g.pc_compatibility));
    console.log('trailer_url:', g.trailer_url);
    console.log('screenshots[0]:', g.screenshots?.[0]);
    console.log('videos:', g.videos?.[0]);
    console.log('\n--- 스키마 키 목록 ---');
    const keys = Object.keys(g).filter(k => k !== '_id' && k !== '__v');
    console.log(keys.join('\n'));
    process.exit(0);
}
main().catch(console.error);

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const total = await Game.countDocuments();

    // trailers 배열 확인
    const hasTrailers = await Game.countDocuments({ 'trailers.0': { $exists: true } });
    // pc_requirements 확인
    const hasPCReqs = await Game.countDocuments({ 'pc_requirements': { $nin: [null, ''] } });
    // pc_requirements 샘플
    const g = await Game.findOne({ 'trailers.0': { $exists: true } }).lean();
    const g2 = await Game.findOne({ pc_requirements: { $exists: true, $ne: null } }).lean();

    console.log(`trailers 있는 게임: ${hasTrailers}개 (${((hasTrailers/total)*100).toFixed(1)}%)`);
    console.log('trailers sample:', JSON.stringify(g?.trailers?.[0]));
    console.log(`\npc_requirements 있는 게임: ${hasPCReqs}개 (${((hasPCReqs/total)*100).toFixed(1)}%)`);
    console.log('pc_requirements sample:', JSON.stringify(g2?.pc_requirements)?.substring(0, 200));
    
    // developers 샘플
    const gDev = await Game.findOne({ developers: { $exists: true, $ne: [] } }).lean();
    console.log('\ndevelopers sample:', JSON.stringify(gDev?.developers));
    console.log('platforms sample:', JSON.stringify(gDev?.platforms));
    console.log('tags sample:', JSON.stringify(gDev?.tags?.slice(0, 5)));

    process.exit(0);
}
main().catch(console.error);

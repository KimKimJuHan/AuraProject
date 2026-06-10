const mongoose = require('mongoose');
require('dotenv').config();
async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const TrendHistory = mongoose.model('TrendHistory', new mongoose.Schema({}, { strict: false }), 'trend_history');
    const total = await TrendHistory.countDocuments({ twitch_viewers: { $gte: 7 } });
    const populated = await TrendHistory.countDocuments({ chzzk_viewers: { $gte: 1 } });
    console.log(`Total Twitch histories (>=7): ${total}, Successfully populated Chzzk histories: ${populated}`);
    process.exit(0);
}
main();

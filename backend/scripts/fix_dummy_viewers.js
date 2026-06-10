const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function fixDummy() {
    await mongoose.connect(process.env.MONGODB_URI);
    const games = await Game.find({ $or: [{ twitch_viewers: { $gt: 0 } }, { steam_ccu: { $gt: 1000 } }] });
    
    console.log(`Processing ${games.length} games for dummy data...`);
    for (const game of games) {
        let modified = false;
        let c = game.chzzk_viewers || 0;
        let s = game.soop_viewers || 0;
        const t = game.twitch_viewers || 0;
        const ccu = game.steam_ccu || 0;

        if (t > 0) {
            if (c === 0) { c = Math.round(t * (0.05 + Math.random() * 0.15)); modified = true; }
            if (s === 0) { s = Math.round(t * (0.03 + Math.random() * 0.10)); modified = true; }
        } else if (ccu > 1000) {
            if (c === 0) { c = Math.round(ccu * 0.01); modified = true; }
            if (s === 0) { s = Math.round(ccu * 0.005); modified = true; }
        }

        if (modified) {
            const trendScore = t + ((c + s) * 2) + Math.round(ccu * 0.3);
            await Game.updateOne({ _id: game._id }, {
                $set: { chzzk_viewers: c, soop_viewers: s, trend_score: trendScore }
            });
            console.log(`Updated ${game.title}: C=${c}, S=${s}, T=${t}, CCU=${ccu}, Score=${trendScore}`);
        }
    }
    console.log("Done.");
    process.exit(0);
}

fixDummy();

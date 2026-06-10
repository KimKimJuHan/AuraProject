const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('DB Connected. Starting Data Validation & Cleanup...');

    const Game = mongoose.model('Game', new mongoose.Schema({}, { strict: false }), 'games');
    const TrendHistory = mongoose.model('TrendHistory', new mongoose.Schema({}, { strict: false }), 'trend_history');

    // 1. Check for broken 0-won deals in non-free games
    let fixedGamesCount = 0;
    const games = await Game.find({});
    
    for (const game of games) {
        let modified = false;
        const pi = game.get('price_info');
        
        if (pi && pi.isFree !== true) {
            // Fix 0 won deals
            if (pi.deals && Array.isArray(pi.deals)) {
                const originalLength = pi.deals.length;
                pi.deals = pi.deals.filter(d => d.price > 0);
                if (pi.deals.length !== originalLength) {
                    modified = true;
                }
            }
            
            // Fix 0 won current_price if regular_price > 0
            if (pi.current_price === 0 && pi.regular_price > 0) {
                pi.current_price = pi.regular_price;
                modified = true;
            }
        }
        
        if (modified) {
            await Game.updateOne({ _id: game._id }, { $set: { price_info: pi } });
            fixedGamesCount++;
        }
    }
    console.log(`[1] Cleaned up fake 0-won deals in ${fixedGamesCount} games.`);

    // 2. Find suspicious duplicates (Enhanced/Legacy/GOTY variations with abnormal prices)
    const suspicious = await Game.find({
        title: { $regex: /enhanced|legacy|remastered/i },
        'price_info.isFree': { $ne: true },
        'price_info.current_price': 0
    });
    console.log(`[2] Found ${suspicious.length} suspicious duplicate/bugged games with 0-won price.`);
    if (suspicious.length > 0) {
        console.log('    Suspicious games:', suspicious.map(g => g.title).join(', '));
        // We will delete them to prevent them from showing up
        const idsToDelete = suspicious.map(g => g._id);
        await Game.deleteMany({ _id: { $in: idsToDelete } });
        console.log(`    -> Deleted ${idsToDelete.length} bad duplicates from DB.`);
    }

    // 3. Verify TrendHistory backfill
    const historySample = await TrendHistory.findOne({ twitch_viewers: { $gt: 0 } }).sort({ recordedAt: -1 });
    if (historySample) {
        console.log(`[3] TrendHistory Check - Most recent Twitch viewers: ${historySample.get('twitch_viewers')}, Chzzk: ${historySample.get('chzzk_viewers')}, Soop: ${historySample.get('soop_viewers')}`);
    } else {
        console.log('[3] TrendHistory Check - No history found with twitch_viewers > 0');
    }

    // 4. Verify PC Specs null/NaN checking
    // PC specs are mostly parsed on the frontend, but we can check if there's any completely broken HTML
    const brokenSpecs = await Game.find({ 'pc_requirements.minimum': { $type: 'string', $regex: /<script/i } });
    console.log(`[4] Found ${brokenSpecs.length} games with broken script tags in PC specs.`);

    console.log('All validations completed.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

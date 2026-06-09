require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function sanitizeDB() {
    console.log('Connecting to DB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected. Starting data sanitization...');

    const corruptedGames = await Game.find({
        $or: [
            { 'price_info.current_price': 0, 'price_info.discount_percent': { $gt: 0 } },
            { 'price_info.isFree': true, 'price_info.discount_percent': { $gt: 0 } }
        ]
    });

    console.log(`Found ${corruptedGames.length} corrupted records where a free game has a discount > 0.`);

    let fixedCount = 0;
    for (const game of corruptedGames) {
        await Game.updateOne(
            { _id: game._id },
            {
                $set: {
                    'price_info.isFree': true,
                    'price_info.current_price': 0,
                    'price_info.discount_percent': 0
                }
            }
        );
        fixedCount++;
        console.log(`[FIXED] ${game.title}: discount set to 0.`);
    }

    console.log(`\nSanitization complete. Fixed ${fixedCount} records.`);
    process.exit(0);
}

sanitizeDB().catch(err => {
    console.error('Error during sanitization:', err);
    process.exit(1);
});

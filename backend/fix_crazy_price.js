const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const Game = require('./models/Game');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await Game.updateOne({ steam_appid: 488790 }, { $set: { 'price_info.current_price_krw': 14500 } });
    console.log('Fixed South Park Fractured But Whole');
    
    // Also let's fix any game where current_price_krw is unreasonably high (e.g. > 1,000,000 won)
    // and current_price is reasonable
    const crazyGames = await Game.find({ 'price_info.current_price_krw': { $gt: 1000000 } }).lean();
    for (const g of crazyGames) {
        if (g.price_info.current_price < 200000) {
            await Game.updateOne({ _id: g._id }, { $set: { 'price_info.current_price_krw': g.price_info.current_price } });
            console.log(`Fixed crazy price for ${g.title}: ${g.price_info.current_price_krw} -> ${g.price_info.current_price}`);
        }
    }
    process.exit();
});

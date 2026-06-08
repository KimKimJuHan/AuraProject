require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('./models/Game');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/playforyou');
    
    // Search games with "repo" in title
    const repoGames = await Game.find({ title: /repo/i }, 'title price_info');
    console.log('--- Games with "repo" in title ---');
    console.log(repoGames);

    // Search 10k-20k games that might be messed up
    const weirdPrices = await Game.find({ 'price_info.current_price': { $gt: 50000, $lt: 80000 } }, 'title price_info').limit(20);
    console.log('\n--- Games with 50k-80k price ---');
    console.log(weirdPrices.map(g => `${g.title}: ${g.price_info.current_price}`));
    
    process.exit(0);
}
test();

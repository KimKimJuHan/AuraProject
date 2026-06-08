require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('./models/Game');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('--- Sample Game with Trailers ---');
    const sample = await Game.findOne({ 'trailers.0': { $exists: true } }).select('title trailers media').lean();
    console.log(JSON.stringify(sample, null, 2));
    
    console.log('\n--- Sample Game without Trailers ---');
    const noTrailer = await Game.findOne({ $or: [{ trailers: { $size: 0 } }, { trailers: { $exists: false } }] }).select('title trailers media').lean();
    console.log(noTrailer);
    
    process.exit();
});

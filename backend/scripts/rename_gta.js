const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Game = require('../models/Game');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    await Game.updateOne({ slug: 'steam-271590' }, { $set: { title: 'Grand Theft Auto V', title_ko: 'Grand Theft Auto V' }});
    console.log('Renamed legacy to normal');
    process.exit(0);
}
run();

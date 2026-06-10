const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Game = require('../models/Game');
        const cs2 = await Game.findOne({steam_appid: 730}).select('title play_time steam_appid').lean();
        console.log('DB CS2:', cs2);

        const res = await axios.get('https://steamspy.com/api.php?request=appdetails&appid=730');
        console.log('SteamSpy CS2:', res.data.average_forever, res.data.median_forever);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
test();

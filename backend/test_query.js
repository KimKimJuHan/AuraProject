const mongoose = require('mongoose');
const User = require('./models/User');
const Game = require('./models/Game');

mongoose.connect('mongodb://localhost:27017/auradb').then(async () => {
    const user = await User.findOne({ steamId: { $ne: null } }).lean();
    if (!user) return console.log('no user');
    console.log('user:', user.username);
    console.log('steamGames:', user.steamGames?.length);
    const owned = (user.steamGames || []).map(g => g.appid);
    console.log('owned ids:', owned.slice(0, 5));
    const q = { steam_appid: { $nin: owned } };
    const c = await Game.countDocuments(q);
    console.log('games not owned:', c);
    const total = await Game.countDocuments();
    console.log('total games:', total);
    process.exit();
});

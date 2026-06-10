require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('./models/Game');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('DB connected');
    const games = await Game.find({ $or: [{ title: /Grand Theft Auto V/i }, { title: /PUBG/i }] }).select('title steam_appid slug').lean();
    console.log('Games:', games);
    mongoose.connection.close();
}).catch(console.error);

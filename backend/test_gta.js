const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Game = mongoose.model('Game', new mongoose.Schema({}, { strict: false }), 'games');
  const game = await Game.findOne({ steam_appid: { $in: [271590, '271590'] } });
  console.log('Game found:', !!game);
  if(game) console.log('steam_appid type:', typeof game.steam_appid, 'value:', game.steam_appid);
  process.exit(0);
});

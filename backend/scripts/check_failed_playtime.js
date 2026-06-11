const mongoose = require('mongoose');
require('dotenv').config({path: '../.env'});
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Game = require('./models/Game');
  const docs = await Game.find({'play_time.raw': { $exists: true, $ne: '정보 없음' }}).select('title play_time').limit(10).lean();
  console.log(JSON.stringify(docs, null, 2));
  process.exit(0);
});

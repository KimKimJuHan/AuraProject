const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/auraproject', { useNewUrlParser: true, useUnifiedTopology: true });
  const Game = require('./backend/models/Game');
  const User = require('./backend/models/User');

  const csGames = await Game.find({ $or: [{ title: /Counter/i }, { title_ko: /카운터/i }] }).select('title title_ko steam_appid slug');
  console.log("CS Games:", csGames);

  const user = await User.findOne({ steamId: { $ne: null } });
  if (user) {
    console.log("Found User with Steam ID:", user.username);
    const hasCS = user.steamGames.find(g => g.appid === 730 || g.name?.toLowerCase().includes('counter'));
    console.log("User has CS:", hasCS ? true : false, hasCS ? hasCS.appid : null);
  }

  process.exit(0);
}

test().catch(console.error);

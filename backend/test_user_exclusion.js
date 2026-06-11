require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const User = require('./models/User');
  const Game = require('./models/Game');
  const cache = require('./utils/simpleCache');

  const users = await User.find({ steamId: { $ne: null } }).select('username steamGames dislikedGames playerType');
  console.log(`Found ${users.length} users with steamId.`);
  
  if (users.length > 0) {
    const user = users[users.length - 1]; // get the last user or something
    console.log(`User: ${user.username}, SteamGames Count: ${user.steamGames ? user.steamGames.length : 0}`);
    
    // Check if CS is in their steam games
    const hasCS = user.steamGames && user.steamGames.find(g => g.appid === 730 || g.name?.toLowerCase().includes('counter'));
    console.log(`Has CS: ${hasCS ? 'Yes (' + hasCS.appid + ')' : 'No'}`);
    
    // simulate candidateQuery
    const appIdsNum = user.steamGames.map(g => Number(g.appid)).filter(id => !isNaN(id));
    const appIdsStr = appIdsNum.map(String);
    const ninAppIds = [...appIdsNum, ...appIdsStr];
    
    console.log(`ninAppIds length: ${ninAppIds.length}`);
    
    const csGames = await Game.find({ steam_appid: 730 }).select('title steam_appid');
    console.log('CS Games in DB:', csGames);
    
    // See if our query excludes it
    const candidateQuery = { steam_appid: { $nin: ninAppIds } };
    const queryTest = await Game.find({ steam_appid: 730, ...candidateQuery });
    console.log('Is CS returned when queried with exclusion?', queryTest.length > 0 ? 'Yes' : 'No');
  }

  process.exit(0);
}

test().catch(console.error);

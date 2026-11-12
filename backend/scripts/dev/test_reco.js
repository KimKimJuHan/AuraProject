const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { getPersonalRecommendations } = require('../../controllers/recommendController');

if (!process.env.TEST_USER_EMAIL) {
    console.error('TEST_USER_EMAIL 환경변수를 설정하세요. (예: TEST_USER_EMAIL=you@example.com node scripts/dev/test_reco.js)');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const User = require('../../models/User');
    const user = await User.findOne({ email: process.env.TEST_USER_EMAIL }).lean();
    
    if(!user) { console.log('User not found'); process.exit(1); }
    
    console.log(`Testing with user ${user._id}, steamGames: ${user.steamGames.length}`);
    
    const req = {
        body: {
            userId: user._id.toString(),
            tags: [],
            term: ''
        }
    };
    
    let resData = null;
    const res = {
        json: (data) => { resData = data; }
    };
    
    await getPersonalRecommendations(req, res);
    
    // Check if owned games are in the output
    const ownedAppIds = user.steamGames.map(g => Number(g.appid));
    const returnedGames = [
        ...resData.data.comprehensive,
        ...resData.data.costEffective,
        ...resData.data.trend,
        ...resData.data.hiddenGem,
        ...resData.data.multiplayer
    ];
    
    let violationCount = 0;
    for(const g of returnedGames) {
        if (ownedAppIds.includes(g.steam_appid)) {
            console.log(`VIOLATION: ${g.title} (${g.steam_appid}) is owned but was recommended!`);
            violationCount++;
        }
    }
    console.log(`Test finished. Total violations: ${violationCount}`);
    process.exit(0);
});

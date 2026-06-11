const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).toArray();
    for(const u of users) {
        console.log(`User: ${u.email}, steamGames: ${u.steamGames?.length || 0}, disliked: ${u.dislikedGames?.length || 0}`);
    }
    process.exit(0);
});

require('dotenv').config();
const mongoose = require('mongoose');

async function createSortIndex() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/auraproject');
        console.log('Connected.');

        const db = mongoose.connection.db;
        const collection = db.collection('games');

        console.log('Creating sort index on steam_ccu, trend_score, and steam_reviews...');
        await collection.createIndex({ steam_ccu: -1, trend_score: -1 });
        await collection.createIndex({ 'steam_reviews.overall.percent': -1 });

        console.log('Sort indexes created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Failed to create index:', error);
        process.exit(1);
    }
}

createSortIndex();

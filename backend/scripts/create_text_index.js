require('dotenv').config();
const mongoose = require('mongoose');

async function createIndex() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/auraproject');
        console.log('Connected.');

        const db = mongoose.connection.db;
        const collection = db.collection('games');

        console.log('Creating text index on title, title_ko, and smart_tags...');
        await collection.createIndex(
            { title: "text", title_ko: "text", smart_tags: "text" },
            { 
                name: "search_text_index", 
                weights: { title_ko: 10, title: 5, smart_tags: 2 } 
            }
        );

        console.log('Text index created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Failed to create index:', error);
        process.exit(1);
    }
}

createIndex();

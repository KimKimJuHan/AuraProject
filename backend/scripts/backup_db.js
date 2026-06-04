/**
 * backup_db.js - MongoDB 컬렉션을 JSON으로 백업
 * 사용: node scripts/backup_db.js
 * 크론: 매일 새벽 자동 실행 권장
 * 백업 위치: backend/backups/YYYY-MM-DD/
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function backup() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결');

    const date = new Date().toISOString().split('T')[0];
    const backupDir = path.join(__dirname, '..', 'backups', date);
    fs.mkdirSync(backupDir, { recursive: true });

    // 백업할 컬렉션
    const collections = ['games', 'users', 'trendhistories'];

    for (const col of collections) {
        try {
            const docs = await mongoose.connection.db.collection(col).find({}).toArray();
            const file = path.join(backupDir, `${col}.json`);
            fs.writeFileSync(file, JSON.stringify(docs, null, 0));
            console.log(`  ✅ ${col}: ${docs.length}개 → ${file}`);
        } catch (e) {
            console.error(`  ❌ ${col}: ${e.message}`);
        }
    }

    // 오래된 백업 정리 (7일 이상)
    try {
        const backupRoot = path.join(__dirname, '..', 'backups');
        const dirs = fs.readdirSync(backupRoot);
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const d of dirs) {
            const dirPath = path.join(backupRoot, d);
            const stat = fs.statSync(dirPath);
            if (stat.isDirectory() && stat.mtimeMs < weekAgo) {
                fs.rmSync(dirPath, { recursive: true, force: true });
                console.log(`  🗑  오래된 백업 삭제: ${d}`);
            }
        }
    } catch {}

    console.log('🎉 백업 완료');
    process.exit(0);
}

backup().catch(e => { console.error('백업 실패:', e.message); process.exit(1); });
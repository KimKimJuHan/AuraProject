/**
 * backup_db.js - MongoDB 데이터 외부 백업 (안전한 버전)
 *
 * Atlas를 사용 중이라면 Atlas 자체 클라우드 백업이 우선입니다.
 * 이 스크립트는 게임 수 통계 확인 + Discord 알림으로 "백업 정상 여부"를 확인합니다.
 * 로컬 JSON 백업도 병행하되, Docker 볼륨 외부의 /tmp에 저장합니다.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const { sendDiscordAlert } = require('../utils/systemHelper');

async function backup() {
    const startTime = Date.now();
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB 연결');

    const date = new Date().toISOString().split('T')[0];
    const backupDir = path.join(__dirname, '..', 'backups', date);
    fs.mkdirSync(backupDir, { recursive: true });

    const collections = ['games', 'users', 'trend_history'];
    const stats = {};
    let hasError = false;

    for (const col of collections) {
        try {
            const docs = await mongoose.connection.db.collection(col).find({}).toArray();
            const file = path.join(backupDir, `${col}.json`);
            fs.writeFileSync(file, JSON.stringify(docs));
            const sizeMB = (fs.statSync(file).size / (1024 * 1024)).toFixed(1);
            stats[col] = { count: docs.length, sizeMB };
            console.log(`  ✅ ${col}: ${docs.length}개 (${sizeMB}MB)`);
        } catch (e) {
            console.error(`  ❌ ${col}: ${e.message}`);
            hasError = true;
        }
    }

    // 7일 이상 된 백업 삭제
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

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const gameCount = stats['games']?.count || 0;
    const trendCount = stats['trend_history']?.count || 0;

    if (hasError) {
        await sendDiscordAlert(
            'DB 백업 실패',
            `일부 컬렉션 백업 중 오류 발생. 로그 확인 필요.\n날짜: ${date}`,
            'error'
        );
    } else {
        // 정상 백업 시 Discord 정보 알림 (매일 현황 확인용)
        await sendDiscordAlert(
            '✅ 일일 DB 백업 완료',
            [
                `📅 날짜: ${date}`,
                `🎮 게임 수: ${gameCount.toLocaleString()}개`,
                `📈 트렌드 기록: ${trendCount.toLocaleString()}건`,
                `⏱ 소요시간: ${elapsed}초`,
            ].join('\n'),
            'info'
        );
    }

    console.log(`🎉 백업 완료 (${elapsed}초)`);
    process.exit(0);
}

backup().catch(e => {
    console.error('백업 실패:', e.message);
    sendDiscordAlert('DB 백업 스크립트 크래시', e.message, 'error').finally(() => process.exit(1));
});
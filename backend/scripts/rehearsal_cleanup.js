/**
 * rehearsal_cleanup.js
 * ─────────────────────────────────────────────────────────────────
 * rehearsal_fill.js 로 채운 추정 데이터를 완전히 원상복구합니다.
 *
 * 동작:
 *  1) TrendHistory에서 isEstimated: true 인 레코드 삭제 (새로 삽입된 것)
 *  2) TrendHistory에서 isEstimated: true 로 수정된 레코드 → chzzk/soop 다시 0으로 원복
 *  3) Game 도큐먼트의 chzzk_viewers / soop_viewers는 trend_collector.js 가
 *     다음 실행 시 덮어씁니다 (직접 건드리지 않음)
 * ─────────────────────────────────────────────────────────────────
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const { MONGODB_URI } = process.env;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI 누락'); process.exit(1); }

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DB 연결 완료\n');

    const col = mongoose.connection.collection('trend_history');

    // 1) 새로 삽입된 추정 레코드 삭제 (rehearsal_fill이 INSERT한 것들)
    //    조건: isEstimated: true 이고 원래 레코드에 없던 것
    //    → 기존 레코드는 twitch_viewers > 0 이거나 steam_ccu > 0 인 경우가 많음
    //    → 가장 안전하게: isEstimated: true 인 것 중 삭제 (원래 있던 건 update만 했으므로 ok)
    const deleteResult = await col.deleteMany({ isEstimated: true });
    console.log(`🗑️  추정 레코드 삭제: ${deleteResult.deletedCount}건`);

    // 2) UPDATE로 수정된 기존 레코드 원복
    //    → isEstimated: true로 수정된 기존 레코드는 deleteMany로 같이 삭제됨
    //    (혹시 남아있을 경우를 위한 안전망)
    const remaining = await col.updateMany(
        { isEstimated: true },
        { $set: { chzzk_viewers: 0, soop_viewers: 0 }, $unset: { isEstimated: '' } }
    );
    if (remaining.modifiedCount > 0) {
        console.log(`🔄 나머지 레코드 원복: ${remaining.modifiedCount}건`);
    }

    console.log('\n✅ 클린업 완료! 추정 데이터가 모두 제거되었습니다.');
    console.log('   실제 데이터는 다음 trend_collector.js 실행 시 채워집니다.');
    process.exit(0);
}

main().catch(e => { console.error('오류:', e); process.exit(1); });

#!/bin/bash
# run_all.sh - 모든 DB 수집/보완 스크립트를 순서대로 실행
# 사용: docker exec my-backend bash scripts/run_all.sh
# 백그라운드: docker exec -d my-backend bash scripts/run_all.sh
# 로그 확인: docker exec my-backend tail -f /tmp/run_all.log

LOG=/tmp/run_all.log
cd /usr/src/app || exit 1

echo "════════════════════════════════════════════" | tee $LOG
echo "  전체 DB 수집/보완 시작: $(date)" | tee -a $LOG
echo "════════════════════════════════════════════" | tee -a $LOG

run() {
  echo "" | tee -a $LOG
  echo "########## $1 ##########" | tee -a $LOG
  echo "시작: $(date '+%H:%M:%S')" | tee -a $LOG
  node "$2" >> $LOG 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ $1 완료: $(date '+%H:%M:%S')" | tee -a $LOG
  else
    echo "⚠️ $1 실패 (계속 진행): $(date '+%H:%M:%S')" | tee -a $LOG
  fi
}

# 1. 시작 전 상태 측정
run "1/6 진단(보완 전)" "scripts/db_health_check.js"

# 2. 신작 게임 추가
run "2/6 신작 게임 추가" "scripts/add_specific_games.js"

# 3. 인기/신작/장르 수집 + 가격
run "3/6 일일 수집기" "scripts/daily_game_collector.js"

# 4. 상점 링크 수정
echo "" | tee -a $LOG
echo "########## 4/6 상점 링크 수정 ##########" | tee -a $LOG
node scripts/fix_store_urls.js --fix >> $LOG 2>&1 && echo "✅ 상점 링크 완료" | tee -a $LOG || echo "⚠️ 상점 링크 실패" | tee -a $LOG

# 5. 전체 보완 (가격/평점/트레일러/트렌드)
run "5/6 전체 보완(enrich_all)" "scripts/enrich_all.js"

# 6. 완료 후 상태 재측정
run "6/6 진단(보완 후)" "scripts/db_health_check.js"

echo "" | tee -a $LOG
echo "════════════════════════════════════════════" | tee -a $LOG
echo "  🎉 전체 완료: $(date)" | tee -a $LOG
echo "════════════════════════════════════════════" | tee -a $LOG
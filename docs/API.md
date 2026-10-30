# API 명세

> Base URL: `https://playforyou.net`  
> 응답 형식: JSON · 인터랙티브 문서: `/api-docs` (Swagger)

## 공통 사항

### 인증 방식
- **세션 쿠키 기반** (`express-session` + MongoDB 세션 저장소)
- 자체 로그인과 소셜 로그인(Google · Naver · Steam) 모두 로그인 성공 시 서버 세션에 사용자 정보를 저장
- 쿠키: `HttpOnly`, `SameSite=Lax`, 운영 환경 `Secure`, 기본 만료 1일 (로그인 유지 선택 시 30일)
- 🔒 표시 API는 로그인 필요, 👑 표시 API는 관리자(`role: admin`) 전용

### Rate Limit

| 대상 | 제한 |
|---|---|
| `/api/*` 전체 | IP당 1분 100회 (인증 API 제외) |
| `/api/recommend/*` | IP당 1분 100회 |
| `/api/auth/login` | IP당 15분 20회 (로그인 무차별 대입 방지) |

### 공통 에러 응답

| 코드 | 의미 |
|---|---|
| 400 | 필수 파라미터 누락, 형식 오류 |
| 401 | 로그인 필요 |
| 403 | 관리자 권한 필요 |
| 404 | 리소스 없음 / 존재하지 않는 API 경로 |
| 429 | 요청 횟수 초과 |
| 500 | 서버 내부 오류 |

```json
{ "success": false, "message": "에러 메시지" }
```

---

## 1. 인증 `/api/auth`

| Method | Path | 설명 | Body / Query |
|---|---|---|---|
| POST | `/send-otp` | 회원가입 이메일 인증번호 발송 (6자리, 10분 유효) | `email`, `username` |
| POST | `/verify-otp` | 인증번호 확인 | `email`, `code` |
| POST | `/signup` | 회원가입 (bcrypt 해시 저장) | `username`, `password`, `email` |
| GET | `/check-username` | 아이디 중복 확인 | `?username=` |
| POST | `/login` | 로그인 | `username`, `password`, `rememberMe` |
| POST | `/logout` | 로그아웃 (세션 삭제) | - |
| GET | `/status` | 현재 로그인 상태와 사용자 정보 | - |
| POST | `/find-username/send-otp` | 아이디 찾기 인증번호 발송 | `email` |
| POST | `/find-username/verify-otp` | 인증 후 아이디 반환 | `email`, `code` |
| POST | `/reset-password/send-otp` | 비밀번호 재설정 인증번호 발송 | `email`, `username` |
| POST | `/reset-password/verify-otp` | 인증 후 재설정 토큰 발급 | `email`, `code`, `username` |
| POST | `/reset-password/confirm` | 새 비밀번호 설정 | `resetToken`, `newPassword` |
| POST | `/change-password` | 🔒 비밀번호 변경 | `currentPassword`, `newPassword` |

### 소셜 로그인 (브라우저 리다이렉트)

| Path | 설명 |
|---|---|
| `GET /google` → `/google/callback` | Google OAuth 2.0 |
| `GET /naver` → `/naver/callback` | Naver OAuth |
| `GET /steam` → `/steam/return` | Steam OpenID. 로그인 상태면 기존 계정에 Steam 연동, 연동 직후 보유 게임·플레이타임 동기화 |

- 성공 시 첫 로그인이면 `/onboarding`(플레이어 유형 선택), 아니면 메인으로 이동
- 실패 시 `/login?error=social`로 이동

---

## 2. 게임 · 검색 `/api`

| Method | Path | 설명 | 파라미터 |
|---|---|---|---|
| GET | `/search/autocomplete` | 검색어 자동완성 (최대 8개, 한글·영문 별칭 사전 지원) | `?q=` (50자 이하) |
| GET | `/search/results` | 검색 결과 (최대 60개) | `?q=` |
| GET | `/games/giveaway` | 기간 한정 무료 배포 게임 (1시간 캐시) | - |
| GET | `/games/:id` | 게임 상세 | `id`: slug 또는 `steam-{appid}` |
| GET | `/games/:id/history` | 최근 14일 트렌드 시계열 (동접자, Twitch · 치지직 · SOOP 시청자 수) | 〃 |
| GET | `/games/:id/myvote` | 🔒 내 좋아요/싫어요 상태 | 〃 |
| POST | `/games/:id/vote` | 🔒 좋아요/싫어요 투표 (같은 값 재요청 시 취소) | `type`: `like` \| `dislike` |
| POST | `/recommend/wishlist` | 찜 목록 게임 정보 + 추천 이유 | `slugs`: string[] |

---

## 3. 추천 `/api/recommend`

### `POST /api/recommend` — 메인 목록

| 필드 | 타입 | 설명 |
|---|---|---|
| `tags` | string[] | 태그 필터 (AND 조건, 유사 태그 자동 확장) |
| `sortBy` | string | `popular` · `new` · `discount` · `price` · `review` · `rising`(최근 3일 트렌드 상승폭) |
| `page` | number | 페이지 (20개 단위) |
| `priceRange` | string | `all` · `free` · `~10000` · `~30000` · `~50000` · `50000+` |
| `hideOwned` | boolean | Steam 보유 게임 제외 |
| `userId` | string | 보유 게임·관심없음 게임 제외에 사용 |

### `POST /api/recommend/personal` — 개인 맞춤 추천
(`/api/recommend/reco`는 같은 핸들러)

| 필드 | 타입 | 설명 |
|---|---|---|
| `userId` | string | 사용자 취향 태그, Steam 플레이 기록, 플레이어 유형, 관심없음 목록 로드 |
| `tags` | string[] | 이번 요청에서 추가로 선택한 취향 태그 |
| `term` | string | 후보 검색어 |

**응답: 5개 섹션** (섹션 간 중복 게임 제거, 섹션당 최대 10개)

| 섹션 | 내용 |
|---|---|
| `comprehensive` | 종합 맞춤 추천 (취향 유사도 + 리뷰 + 트렌드 + 플레이 이력 가중합) |
| `costEffective` | 가성비: 할인 중이거나 저렴한 게임 |
| `trend` | 지금 주목받는 게임 |
| `hiddenGem` | 숨겨진 명작: 긍정률 90% 이상이면서 리뷰 수가 적당한 게임 |
| `multiplayer` | 멀티플레이 · 협동 · PvP 게임 |

```json
{
  "success": true,
  "data": {
    "comprehensive": [
      {
        "slug": "hades",
        "title": "Hades",
        "title_ko": "하데스",
        "smart_tags": ["로그라이크", "액션"],
        "reason": "로그라이크, 액션 장르 취향에 맞는 게임 · 스팀 98% 긍정 평가"
      }
    ],
    "costEffective": [],
    "trend": [],
    "hiddenGem": [],
    "multiplayer": []
  },
  "validTags": ["RPG", "FPS", "액션"]
}
```
- 점수 산식과 플레이어 유형별 가중치는 [README 추천 알고리즘](../README.md#-추천-알고리즘) 참고
- 같은 조건의 결과는 5분간 인메모리 캐시에 저장 (취향·유형·Steam 연동이 바뀌면 캐시 키가 달라져 즉시 반영, 캐시 응답은 `"cached": true`)
- 위 예시의 게임 데이터는 형식 설명용 샘플입니다

---

## 4. 사용자 `/api/user` 🔒

| Method | Path | 설명 | Body |
|---|---|---|---|
| GET | `/info` | 내 정보 | - |
| PUT | `/info` | 내 정보 수정 | `username` |
| PATCH | `/me/displayName` | 닉네임 변경 | `displayName` |
| PUT | `/playerType` | 플레이어 유형 변경 | `playerType`: `casual` · `beginner` · `intermediate` · `hardcore` · `streamer` |
| PUT | `/password` | 비밀번호 변경 | `currentPassword`, `newPassword` |
| DELETE | `/account` | 회원 탈퇴 | - |
| GET | `/games` | Steam 보유 게임 목록 | - |
| DELETE | `/steam` | Steam 연동 해제 | - |
| POST | `/tags` | 취향 태그 저장 | `tags` |
| PUT | `/liked-tags` | 취향 태그 수정 | `tags` |
| GET | `/wishlist` | 찜 목록 | - |
| POST | `/wishlist` | 찜 추가 | `slug` |
| DELETE | `/wishlist/:slug` | 찜 삭제 | - |
| POST | `/dislike` | 관심없음 등록 (이후 추천에서 제외) | `slug`, `tags` |
| DELETE | `/dislike/:slug` | 관심없음 해제 | - |
| GET | `/disliked` | 관심없음 목록 | - |
| POST | `/price-alert` | 목표가 알림 등록 | `slug`, `targetPrice` |
| GET | `/price-alert/:slug` | 특정 게임 알림 조회 | - |
| DELETE | `/price-alert/:slug` | 알림 삭제 | - |
| GET | `/price-alerts` | 내 알림 목록 | - |
| GET | `/notifications/settings` | 알림 설정 조회 | - |
| PUT | `/notifications/settings` | 알림 설정 변경 | `saleAlert`, `newGameAlert`, `emailAlert` |

---

## 5. 알림 `/api/notifications` 🔒

| Method | Path | 설명 |
|---|---|---|
| GET | `/` | 내 알림 목록 |
| GET | `/unread-count` | 읽지 않은 알림 수 |
| PATCH | `/:id/read` | 읽음 처리 |
| POST | `/read-all` | 전체 읽음 처리 |
| DELETE | `/:id` | 알림 삭제 |
| DELETE | `/` | 전체 삭제 |

---

## 6. 고객지원 `/api/support`

| Method | Path | 설명 | Body |
|---|---|---|---|
| GET | `/faqs` | FAQ 목록 | - |
| POST | `/inquiries` | 🔒 1:1 문의 등록 | `category`(`account` · `recommend` · `steam` · `bug` · `etc`), `title`(≤100자), `content`(≤5000자) |
| GET | `/inquiries/my` | 🔒 내 문의 목록 | - |
| GET | `/inquiries/:id` | 🔒 문의 상세 (본인 또는 관리자) | - |
| GET | `/admin/inquiries` | 👑 전체 문의 목록 | - |
| PATCH | `/admin/inquiries/:id/answer` | 👑 답변 등록 | `answer` |
| PATCH | `/admin/inquiries/:id/status` | 👑 상태 변경 | `status`: `open` · `answered` · `closed` |

---

## 7. 운영

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 서버·DB 상태. Docker healthcheck에서 30초마다 호출 |
| GET | `/api-docs` | Swagger UI |

```json
{ "status": "ok", "db": "connected" }
```

---

## 알려진 개선 과제
- 추천 API(`/api/recommend`, `/personal`)가 요청 본문의 `userId`를 그대로 사용합니다. 세션의 사용자 ID만 쓰도록 바꿔, 다른 사용자의 ID로 맞춤 추천을 조회할 수 없게 할 예정입니다.
- `/api/recommend/personal`과 `/reco`가 같은 기능이라 하나로 통합할 예정입니다.
- 로그인 제한기가 실제 경로가 아닌 `/api/auth/register`에 걸려 있어, 회원가입(`/signup`)과 인증번호 발송(`/send-otp`)에는 강화된 제한이 적용되지 않습니다. 메일 발송 남용을 막기 위해 해당 경로로 옮길 예정입니다.

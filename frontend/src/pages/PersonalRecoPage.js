// frontend/src/pages/PersonalRecoPage.js

import React, { useState, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import "./RecommendPage.css";

// 🔥 모든 태그 카테고리 정의
const TAG_CATEGORIES = {
  장르: [
    "RPG",
    "FPS",
    "시뮬레이션",
    "전략",
    "스포츠",
    "레이싱",
    "퍼즐",
    "생존",
    "공포",
    "액션",
    "어드벤처",
  ],
  시점: ["1인칭", "3인칭", "탑다운", "사이드뷰", "쿼터뷰"],
  그래픽: ["픽셀 그래픽", "2D", "3D", "만화 같은", "현실적", "애니메이션", "귀여운"],
  테마: [
    "판타지",
    "공상과학",
    "중세",
    "현대",
    "우주",
    "좀비",
    "사이버펑크",
    "마법",
    "전쟁",
    "포스트아포칼립스",
  ],
  특징: [
    "오픈 월드",
    "자원관리",
    "스토리 중심",
    "선택의 중요성",
    "캐릭터 커스터마이즈",
    "협동 캠페인",
    "멀티플레이",
    "싱글플레이",
    "로그라이크",
    "소울라이크",
  ],
};

const API_BASE = "http://localhost:8000";

function PersonalRecoPage({ user }) {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(new Set());
  const pickedRef = useRef(new Set());

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // 스팀 연동 상태
  const [steamGames, setSteamGames] = useState([]);
  const [topGames, setTopGames] = useState([]);
  const [steamStatus, setSteamStatus] = useState("LOADING"); // GUEST | NOT_LINKED | LINKED | PRIVATE | ERROR

  const [searchParams] = useSearchParams();
  const urlSteamId = searchParams.get("steamId");

  useEffect(() => {
    if (user) {
      checkSteamConnection();
    } else {
      setSteamStatus("GUEST");
    }
    // 페이지 진입 시 기본 추천 한 번 호출
    fetchReco();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, urlSteamId]);

  const checkSteamConnection = async () => {
    setSteamStatus("LOADING");
    try {
      const res = await axios.get(`${API_BASE}/api/user/games`, {
        withCredentials: true,
      });
      const games = res.data || [];
      setSteamGames(games);
      const sorted = [...games].sort(
        (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)
      );
      setTopGames(sorted.slice(0, 5));
      setSteamStatus("LINKED");
    } catch (e) {
      if (e.response) {
        if (e.response.status === 400) {
          // 스팀 연동 안 됨
          setSteamStatus("NOT_LINKED");
        } else if (e.response.status === 401) {
          // 로그인 세션 없음 / 토큰 만료 → 그냥 "연동 안 된 상태"처럼 처리
          setSteamStatus("NOT_LINKED");
        } else if (
          e.response.status === 403 &&
          e.response.data?.errorCode === "PRIVATE_PROFILE"
        ) {
          setSteamStatus("PRIVATE");
        } else {
          setSteamStatus("ERROR");
        }
      } else {
        setSteamStatus("ERROR");
      }
    }
  };

  const toggle = (tag) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      pickedRef.current = next;
      return next;
    });
  };

  const formatPlaytime = (m) => {
    if (!m || m <= 0) return "플레이 기록 없음";
    return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간`;
  };

  const formatPrice = (priceInfo) => {
    if (!priceInfo) return "가격 정보 없음";
    if (priceInfo.isFree || priceInfo.current_price === 0) return "무료";
    if (
      priceInfo.current_price !== undefined &&
      priceInfo.current_price !== null
    ) {
      return `₩${priceInfo.current_price.toLocaleString()}`;
    }
    return "가격 정보 없음";
  };

  const fetchReco = async () => {
    if (loading) return;
    setErr("");
    setLoading(true);
    try {
      const likedTags = Array.from(pickedRef.current);

      const payload = {
        userId: user?._id || null,
        tags: likedTags,
        steamId: user?.steamId || urlSteamId || null,
        term: term || "",
      };

      const res = await axios.post(
        `${API_BASE}/api/advanced/personal`,
        payload,
        { withCredentials: true }
      );

      const games = res.data?.games || [];

      const items = games.map((g) => ({
        slug: g.slug,
        name: g.title_ko || g.title,
        thumb: g.main_image,
        price: formatPrice(g.price_info),
        playtime: g.play_time || "정보 없음",
        score:
          typeof g.score === "number"
            ? Math.max(0, Math.min(100, g.score))
            : 0,
      }));

      setData({ items });
      if (!items.length) {
        setErr("조건에 맞는 게임이 없습니다.");
      }
    } catch (e) {
      console.error(e);
      setErr("데이터 로딩 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleLinkSteam = () => {
    window.location.href = `${API_BASE}/api/auth/steam?link=true`;
  };

  return (
    <div className="reco-container">
      <div className="search-panel">
        <h1>🤖 AI 맞춤 추천</h1>

        {/* 스팀 대시보드 */}
        <div className="steam-dashboard">
          {!user ? (
            <div className="steam-guest-msg">
              <span>로그인하고 내 스팀 게임 기록을 분석받아보세요!</span>
              <Link to="/login" className="search-btn">
                로그인
              </Link>
            </div>
          ) : (
            <>
              {steamStatus === "NOT_LINKED" && (
                <div className="steam-connect-box">
                  <span>스팀 계정을 연동하면 더 정확한 추천을 받습니다.</span>
                  <button onClick={handleLinkSteam} className="search-btn">
                    🎮 Steam 연동
                  </button>
                </div>
              )}

              {steamStatus === "PRIVATE" && (
                <div className="steam-connect-box">
                  <span>스팀 프로필이 비공개라 기록을 가져올 수 없습니다.</span>
                  <a
                    href="https://store.steampowered.com/account/preferences"
                    target="_blank"
                    rel="noreferrer"
                    className="search-btn"
                  >
                    공개 설정 방법 보기
                  </a>
                </div>
              )}

              {steamStatus === "ERROR" && (
                <div className="steam-connect-box">
                  <span>스팀 정보를 불러오는 중 오류가 발생했습니다.</span>
                </div>
              )}

              {steamStatus === "LINKED" && (
                <>
                  <div className="steam-header">
                    <h3 style={{ color: "#46d369", margin: 0 }}>
                      ✅ {user.username}님의 TOP 5
                    </h3>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#aaa",
                        marginLeft: "8px",
                      }}
                    >
                      (보유 게임 {steamGames.length}개 기준)
                    </span>
                  </div>
                  <div className="steam-list">
                    {topGames.map((g, i) => (
                      <div key={i} className="steam-card">
                        <img
                          src={
                            g.img_icon_url
                              ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
                              : "https://via.placeholder.com/32"
                          }
                          alt={g.name}
                          className="steam-thumb"
                          onError={(e) => {
                            e.target.src = "https://via.placeholder.com/32";
                          }}
                        />
                        <div className="steam-info-col">
                          <div className="steam-game-name" title={g.name}>
                            {g.name}
                          </div>
                          <div className="steam-playtime">
                            {formatPlaytime(g.playtime_forever)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* 검색 + 버튼 */}
        <div className="search-row">
          <input
            className="search-input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="게임 제목 검색..."
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchReco();
            }}
          />
          <button className="search-btn" onClick={fetchReco}>
            추천 받기
          </button>
        </div>

        {/* 태그 선택 */}
        <div className="tags-panel">
          {Object.entries(TAG_CATEGORIES).map(([group, list]) => (
            <div className="tag-group" key={group}>
              <div className="tag-label">{group}</div>
              <div className="tag-list">
                {list.map((t) => (
                  <div
                    key={t}
                    className={`tag-chip ${picked.has(t) ? "on" : ""}`}
                    onClick={() => toggle(t)}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 결과 리스트 */}
      {!loading && data?.items && (
        <div className="result-panel">
          <h2>✨ 추천 결과 ({data.items.length}개)</h2>
          <div className="game-grid">
            {data.items.map((g, i) => (
              <Link to={`/game/${g.slug}`} key={i} className="game-card">
                <img src={g.thumb} className="thumb" alt={g.name} />
                <div className="card-info">
                  <div className="game-title">{g.name}</div>
                  <div className="game-meta-row">
                    <span className="game-price">{g.price}</span>
                    <span className="game-playtime">⏳ {g.playtime}</span>
                  </div>
                  <div className="score-bar">
                    <div style={{ width: `${g.score}%` }}></div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="loading-box">🔮 분석 중...</div>}
      {err && <div className="error-box">{err}</div>}
    </div>
  );
}

export default PersonalRecoPage;

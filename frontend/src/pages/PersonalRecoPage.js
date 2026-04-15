import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import "../styles/Recommend.css";
import { API_BASE_URL } from "../config";
import { safeLocalStorage } from "../utils/storage";
import Skeleton from '../Skeleton'; // ★ 누락되었던 스켈레톤 컴포넌트 임포트 복구

const FALLBACK_IMAGE = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image";

const TAG_CATEGORIES = {
  장르: ["RPG", "FPS", "시뮬레이션", "전략", "스포츠", "레이싱", "퍼즐", "생존", "공포", "액션", "어드벤처"],
  시점: ["1인칭", "3인칭", "탑다운", "사이드뷰", "쿼터뷰"],
  그래픽: ["픽셀 그래픽", "2D", "3D", "만화 같은", "현실적", "애니메이션", "귀여운"],
  테마: ["판타지", "공상과학", "중세", "현대", "우주", "좀비", "사이버펑크", "마법", "전쟁", "포스트아포칼립스"],
  특징: ["오픈 월드", "자원관리", "스토리 중심", "선택의 중요성", "캐릭터 커스터마이즈", "협동 캠페인", "멀티플레이", "싱글플레이", "로그라이크", "소울라이크"]
};

function GameCard({ game }) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [imgSrc, setImgSrc] = useState(game.thumb || game.main_image || FALLBACK_IMAGE);

  useEffect(() => {
    const wishlistStr = safeLocalStorage.getItem("gameWishlist");
    const wishlist = wishlistStr ? JSON.parse(wishlistStr) : [];
    setIsWishlisted(wishlist.includes(game.slug));
    setImgSrc(game.thumb || game.main_image || FALLBACK_IMAGE);
  }, [game.slug, game.thumb, game.main_image]);

  const toggleWishlist = (e) => {
    e.preventDefault();
    const wishlistStr = safeLocalStorage.getItem("gameWishlist");
    const wishlist = wishlistStr ? JSON.parse(wishlistStr) : [];
    let newWishlist;
    if (isWishlisted) newWishlist = wishlist.filter((slug) => slug !== game.slug);
    else newWishlist = [...wishlist, game.slug];
    safeLocalStorage.setItem("gameWishlist", JSON.stringify(newWishlist));
    setIsWishlisted(!isWishlisted);
  };

  const displayName = game.name || game.title || game.title_ko || "게임 이름 없음";
  // ★ 0원이면 무조건 '무료'로 강제 표기하는 방어 로직 유지
  const displayPrice = game.price || (game.price_info?.isFree || game.price_info?.current_price === 0 ? "무료" : game.price_info?.current_price ? `${Number(game.price_info.current_price).toLocaleString()}원` : "가격 정보 없음");

  const rawPlaytime = game.playtime || "";
  const showPlaytime = rawPlaytime && rawPlaytime !== "정보 없음" && !rawPlaytime.includes("Hours") && !rawPlaytime.includes("Story") && rawPlaytime.length < 10;

  const scoreValue = typeof game.recommendationScore === "number" ? game.recommendationScore : typeof game.score === "number" ? game.score : typeof game.similarityScore === "number" ? Math.round(game.similarityScore * 100) : 0;
  const scoreBarWidth = Math.max(0, Math.min(100, scoreValue * 10));
  // ★ 팀원이 작성한 추천 이유 출력 로직 유지
  const reasonText = game.reason || "선호 조건과 잘 맞아 추천";

  return (
    <Link to={`/game/${game.slug || `steam-${game.steam_appid || game.appid}`}`} className="game-card net-card">
      <div className="thumb-wrapper">
        <img src={imgSrc} className="thumb" alt={displayName} onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }} />
        <div className="net-card-gradient"></div>
        <button className="heart-btn" onClick={toggleWishlist}>{isWishlisted ? "❤️" : "🤍"}</button>
      </div>

      <div className="card-info">
        <div className="game-title text-truncate">{displayName}</div>

        <div style={{ fontSize: "12px", color: "#f5c14b", marginTop: "6px", marginBottom: "6px", lineHeight: 1.4, minHeight: "32px" }}>
          {reasonText}
        </div>

        <div className="game-meta-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="game-price" style={{ color: displayPrice === "무료" ? "#46d369" : displayPrice === "가격 정보 없음" ? "#777" : "#fff", fontSize: displayPrice === "가격 정보 없음" ? "11px" : "13px", opacity: displayPrice === "가격 정보 없음" ? 0.7 : 1, fontWeight: displayPrice === "가격 정보 없음" ? "normal" : "bold" }}>
            {displayPrice === "가격 정보 없음" ? "가격 정보 수집 중" : displayPrice}
          </span>
          {showPlaytime && <span className="game-playtime" style={{ color: '#bbb', fontSize: '12px' }}>⏳ {game.playtime}</span>}
        </div>

        <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px", marginTop: "8px" }}>추천 점수 {scoreValue}</div>
        <div className="score-bar"><div style={{ width: `${scoreBarWidth}%` }}></div></div>
      </div>
    </Link>
  );
}

function RecoSection({ title, games, loading }) {
  const [expanded, setExpanded] = useState(false);

  // ★ 스켈레톤 UI 복구: 로딩 중일 때 텍스트 대신 깜빡이는 빈 카드 4개를 보여줍니다.
  if (loading) {
      return (
          <div style={{ marginBottom: '50px' }}>
              <h3 style={{ margin:0, fontSize:'22px', color:'#e50914', marginBottom:'15px', borderBottom:'1px solid #333', paddingBottom:'10px' }}>{title}</h3>
              <div className="game-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                  {Array(4).fill(0).map((_, i) => <Skeleton key={i} height="250px" />)}
              </div>
          </div>
      );
  }

  if (!games || games.length === 0) return null;
  const displayGames = expanded ? games : games.slice(0, 4);

  return (
    <div style={{ marginBottom: "50px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "15px", borderBottom: "1px solid #333", paddingBottom: "10px" }}>
        <h3 style={{ margin: 0, fontSize: "22px", color: "#e50914" }}>{title}</h3>
        {games.length > 4 && (
          <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", textDecoration: "underline" }}>
            {expanded ? "접기" : "더보기 +"}
          </button>
        )}
      </div>

      <div className="game-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
        {displayGames.map((g, i) => <GameCard key={g._id || g.slug || i} game={g} />)}
      </div>
    </div>
  );
}

function PersonalRecoPage({ user }) {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [data, setData] = useState({ comprehensive: [], costEffective: [], trend: [], hiddenGem: [], multiplayer: [] });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [topGames, setTopGames] = useState([]);
  const [steamStatus, setSteamStatus] = useState("LOADING");
  const [searchParams] = useSearchParams();
  const urlSteamId = searchParams.get("steamId");

  const checkSteamConnection = async () => {
    setSteamStatus("LOADING");
    try {
      const res = await axios.get(`${API_BASE_URL}/api/user/games`, { withCredentials: true });
      if (res.data.linked === false) setSteamStatus("NOT_LINKED");
      else if (res.data.error === "PRIVATE") setSteamStatus("PRIVATE");
      else {
        const sorted = (res.data.games || []).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);
        setTopGames(sorted);
        setSteamStatus("LINKED");
      }
    } catch (err) { setSteamStatus("ERROR"); }
  };

  useEffect(() => {
    if (user) checkSteamConnection();
    else setSteamStatus("GUEST");
  }, [user, urlSteamId]);

  useEffect(() => {
    const fetchReco = async () => {
      setErr("");
      setLoading(true);
      try {
        const tags = Array.from(picked);
        // ★ API 경로를 /api/steam/reco 로 명확히 고정
        const res = await axios.post(`${API_BASE_URL}/api/steam/reco`, { userId: user?.id || user?._id || null, tags, term }, { withCredentials: true });
        
        const responseData = res.data?.data || {};
        const normalizedData = {
          comprehensive: responseData.comprehensive || [], costEffective: responseData.costEffective || [],
          trend: responseData.trend || [], hiddenGem: responseData.hiddenGem || [], multiplayer: responseData.multiplayer || []
        };

        setData(normalizedData);
        if (!Object.values(normalizedData).some(list => Array.isArray(list) && list.length > 0)) setErr("조건에 맞는 게임이 없습니다.");
      } catch (e) {
        setErr("데이터 로딩 실패");
        setData({ comprehensive: [], costEffective: [], trend: [], hiddenGem: [], multiplayer: [] });
      } finally { setLoading(false); }
    };
    const timer = setTimeout(() => { fetchReco(); }, 300);
    return () => clearTimeout(timer);
  }, [picked, term, user]);

  const toggle = (t) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleLinkSteam = () => { window.location.href = `${API_BASE_URL}/api/auth/steam?link=true`; };
  const handleUnlinkSteam = async () => {
    if (!window.confirm("정말 연동을 해제하시겠습니까?")) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/user/steam`, { withCredentials: true });
      alert("해제되었습니다.");
      setSteamStatus("NOT_LINKED");
      setTopGames([]);
    } catch (e) { alert("해제 실패"); }
  };

  const formatPlaytime = (m) => (m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간`);

  return (
    <div className="reco-container" style={{ padding: '40px 5%', color: '#fff', minHeight: '100vh' }}>
      <div className="search-panel">
        <h1 style={{ fontSize: '28px', borderBottom: '2px solid #E50914', display: 'inline-block', paddingBottom: '10px' }}>🤖 게임 맞춤 추천</h1>
        
        <div className="steam-dashboard" style={{ marginTop: '20px', marginBottom: '40px' }}>
          {!user ? (
            <div className="steam-guest-msg" style={{ backgroundColor: '#181818', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ display: 'block', marginBottom: '15px' }}>로그인하고 내 스팀 게임 기록을 분석받아보세요!</span>
              <Link to="/login" className="search-btn" style={{ backgroundColor: '#E50914', color: '#fff', padding: '10px 20px', borderRadius: '4px', textDecoration: 'none' }}>로그인</Link>
            </div>
          ) : (
            <>
              {(steamStatus === "NOT_LINKED" || steamStatus === "ERROR") && (
                <div className="steam-connect-box" style={{ backgroundColor: '#181818', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                  <span style={{ display: 'block', marginBottom: '15px' }}>스팀 계정을 연동하면 더 정확한 추천을 받습니다.</span>
                  <button onClick={handleLinkSteam} className="search-btn" style={{ backgroundColor: '#1b2838', color: '#fff', border: '1px solid #66c0f4', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer' }}>🎮 Steam 연동</button>
                </div>
              )}
              {steamStatus === "PRIVATE" && <div className="steam-error" style={{ color: '#ff4444' }}>🔒 스팀 프로필이 비공개 상태입니다.</div>}
              {steamStatus === "LINKED" && (
                <div style={{ backgroundColor: '#181818', padding: '20px', borderRadius: '8px' }}>
                  <div className="steam-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, color: "#46d369" }}>✅ {user.displayName || user.username}님의 TOP 5</h3>
                    <button onClick={handleUnlinkSteam} style={{ background: "none", border: "1px solid #555", color: "#aaa", fontSize: "12px", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}>연동 해제</button>
                  </div>
                  <div className="steam-list">
                    {topGames.map((g, i) => {
                      const maxPlaytime = topGames[0].playtime_forever || 1;
                      const percent = Math.min(100, (g.playtime_forever / maxPlaytime) * 100);
                      return (
                        <div key={i} className="steam-card" style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                          <img src={`http://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`} className="steam-game-icon" alt="" onError={(e) => (e.target.src = FALLBACK_IMAGE)} style={{ width: '40px', height: '40px', borderRadius: '4px' }}/>
                          <div className="steam-info-col" style={{ flex: 1 }}>
                            <div className="steam-row-top" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px' }}>
                              <span className="steam-game-name">{g.name}</span>
                              <span className="steam-playtime" style={{ color: '#bbb' }}>{formatPlaytime(g.playtime_forever)}</span>
                            </div>
                            <div className="steam-playtime-bar" style={{ width: '100%', height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${percent}%`, height: '100%', backgroundColor: '#46d369' }}></div>
                            </div>
                            <div className="steam-tags" style={{ marginTop: '5px' }}>
                              {g.smart_tags && g.smart_tags.length > 0 ? (
                                g.smart_tags.slice(0, 3).map((t, idx) => <span key={idx} className="steam-tag" style={{ fontSize: '11px', color: '#888', marginRight: '5px', backgroundColor: '#222', padding: '2px 6px', borderRadius: '4px' }}>{t}</span>)
                              ) : <span className="steam-tag-empty" style={{ fontSize: '11px', color: '#666' }}>태그 없음</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="search-row" style={{ marginBottom: '30px' }}>
          <input className="search-input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="관심 있는 게임이나 키워드 검색..." style={{ width: '100%', padding: '12px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#111', color: '#fff', fontSize: '16px' }} />
        </div>

        <div className="tags-panel" style={{ marginBottom: '40px' }}>
          {Object.entries(TAG_CATEGORIES).map(([group, list]) => (
            <div className="tag-group" key={group} style={{ marginBottom: '15px' }}>
              <div className="tag-label" style={{ fontSize: '14px', color: '#888', marginBottom: '8px' }}>{group}</div>
              <div className="tag-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {list.map((t) => {
                  const isSelected = picked.has(t);
                  return (
                    <div key={t} className={`tag-chip ${isSelected ? "on" : ""}`} onClick={() => toggle(t)} style={{ padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer', backgroundColor: isSelected ? '#E50914' : '#333', color: isSelected ? '#fff' : '#ccc', border: `1px solid ${isSelected ? '#E50914' : '#444'}` }}>
                      {t}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="result-panel">
        <h2>✨ 추천 결과</h2>
        <RecoSection title="🌟 종합 추천 (BEST)" games={data.comprehensive} loading={loading} />
        <RecoSection title="💰 가격 합리성 추천 (갓성비)" games={data.costEffective} loading={loading} />
        <RecoSection title="🔥 지금 뜨는 트렌드" games={data.trend} loading={loading} />
        <RecoSection title="💎 숨겨진 명작" games={data.hiddenGem} loading={loading} />
        <RecoSection title="👥 친구와 함께" games={data.multiplayer} loading={loading} />
      </div>

      {!loading && err && <div className="error-box" style={{ textAlign: 'center', color: '#ff4444', marginTop: '20px' }}>{err}</div>}
    </div>
  );
}

export default PersonalRecoPage;
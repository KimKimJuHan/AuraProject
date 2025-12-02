// frontend/src/pages/PersonalRecoPage.js

import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from 'axios'; 
import "../styles/Recommend.css"; 
import { API_BASE_URL } from '../config'; 

const FALLBACK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const TAG_CATEGORIES = {
  '장르': ['RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '액션', '어드벤처'],
  '시점': ['1인칭', '3인칭', '탑다운', '사이드뷰', '쿼터뷰'],
  '그래픽': ['픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', '애니메이션', '귀여운'],
  '테마': ['판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', '전쟁', '포스트아포칼립스'],
  '특징': ['오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', '캐릭터 커스터마이즈', '협동 캠페인', '멀티플레이', '싱글플레이', '로그라이크', '소울라이크']
};

function GameCard({ game }) {
    const [isWishlisted, setIsWishlisted] = useState(false);
    const [imgSrc, setImgSrc] = useState(game.thumb || FALLBACK_IMAGE);

    useEffect(() => {
        const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
        setIsWishlisted(wishlist.includes(game.slug));
        setImgSrc(game.thumb || FALLBACK_IMAGE); 
    }, [game.slug, game.thumb]);

    const toggleWishlist = (e) => {
        e.preventDefault();
        const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
        let newWishlist;
        if (isWishlisted) newWishlist = wishlist.filter(slug => slug !== game.slug);
        else newWishlist = [...wishlist, game.slug];
        localStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
        setIsWishlisted(!isWishlisted);
    };

    const isFree = game.price === "무료";

    return (
        <Link to={`/game/${game.slug || `steam-${game.appid}`}`} className="game-card">
            <div className="thumb-wrapper">
                <img 
                    src={imgSrc} 
                    className="thumb" 
                    alt={game.name} 
                    onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }}
                />
                <div className="net-card-gradient"></div>
                <button className="heart-btn" onClick={toggleWishlist}>
                    {isWishlisted ? '❤️' : '🤍'}
                </button>
            </div>
            
            <div className="card-info">
                <div className="game-title">{game.name}</div>
                <div className="game-meta-row">
                    <span className="game-price" style={{color: isFree ? '#46d369' : '#fff'}}>
                        {game.price}
                    </span>
                    <span className="game-playtime">⏳ {game.playtime}</span>
                </div>
                <div style={{fontSize:'11px', color:'#888', marginBottom:'4px'}}>추천 점수 {game.score}</div>
                <div className="score-bar"><div style={{width:`${game.score}%`}}></div></div>
            </div>
        </Link>
    );
}

function RecoSection({ title, games }) {
    const [expanded, setExpanded] = useState(false);
    if (!games || games.length === 0) return null;

    const displayGames = expanded ? games : games.slice(0, 4);

    return (
        <div style={{ marginBottom: '50px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'15px', borderBottom:'1px solid #333', paddingBottom:'10px' }}>
                <h3 style={{ margin:0, fontSize:'22px', color:'#e50914' }}>{title}</h3>
                {games.length > 4 && (
                    <button 
                        onClick={() => setExpanded(!expanded)}
                        style={{ background:'none', border:'none', color:'#ccc', cursor:'pointer', textDecoration:'underline' }}
                    >
                        {expanded ? '접기' : '더보기 +'}
                    </button>
                )}
            </div>
            <div className="game-grid">
                {displayGames.map((g, i) => (
                    <GameCard key={g._id || i} game={g} />
                ))}
            </div>
        </div>
    );
}

function PersonalRecoPage({ user }) {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [validTags, setValidTags] = useState([]); 
  const strict = false;
  const k = 12;
  
  const [data, setData] = useState({ overall: [], trend: [], playtime: [], tag: [] });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [topGames, setTopGames] = useState([]);     
  const [steamStatus, setSteamStatus] = useState('LOADING'); 
  const [searchParams] = useSearchParams();
  const urlSteamId = searchParams.get('steamId');

  // ★ 스팀 연동 체크
  const checkSteamConnection = async () => {
    setSteamStatus('LOADING');
    try {
        const res = await axios.get(`${API_BASE_URL}/api/user/games`, { withCredentials: true });
        
        // 성공 시 (DB에서 최신 스팀ID 확인됨)
        const sorted = (res.data || []).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);
        setTopGames(sorted);
        setSteamStatus('LINKED');
    } catch (err) {
        if (err.response) {
            if (err.response.status === 400) {
                // 400 = 스팀 ID 없음 = 연동 안 됨
                setSteamStatus('NOT_LINKED');
            } else if (err.response.status === 403) {
                setSteamStatus('PRIVATE');
            } else {
                setSteamStatus('ERROR');
            }
        } else {
            setSteamStatus('NOT_LINKED');
        }
    }
  };

  useEffect(() => {
    if (user) checkSteamConnection();
    else setSteamStatus('GUEST');
    // eslint-disable-next-line
  }, [user, urlSteamId]); // URL에 steamId가 있으면(연동 직후) 다시 체크

  // 추천 데이터 로드
  useEffect(() => {
    const fetchReco = async () => {
        setErr("");
        setLoading(true);
        try {
          const liked = Array.from(picked);
          const res = await axios.post(
              `${API_BASE_URL}/api/steam/reco`, 
              { term, liked, strict, k },
              { withCredentials: true } 
          );
          setData(res.data);
          
          if (res.data.validTags) setValidTags(res.data.validTags);

          if (!res.data.overall?.length && !res.data.trend?.length) {
              setErr("조건에 맞는 게임이 없습니다.");
          }
        } catch (e) { 
            console.error(e);
            setErr("데이터 로딩 실패"); 
        } 
        finally { setLoading(false); }
    };

    const timer = setTimeout(() => {
        fetchReco();
    }, 500);

    return () => clearTimeout(timer);
  }, [picked, term]); 

  const toggle = (t) => {
    const isSelected = picked.has(t);
    // 선택된 게 있고 & 유효목록에 없고 & 선택 안 된 거면 클릭 막기
    if (picked.size > 0 && !validTags.includes(t) && !isSelected) return;

    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleLinkSteam = () => { 
      window.location.href = `${API_BASE_URL}/api/auth/steam?link=true`; 
  };

  // ★ 연동 해제 핸들러
  const handleUnlinkSteam = async () => {
      if (!window.confirm("정말 스팀 연동을 해제하시겠습니까?")) return;
      try {
          await axios.delete(`${API_BASE_URL}/api/user/steam`, { withCredentials: true });
          alert("해제되었습니다.");
          setSteamStatus('NOT_LINKED');
          setTopGames([]);
      } catch (e) {
          alert("해제 실패");
      }
  };
  
  const formatPlaytime = (m) => m < 60 ? `${m}분` : `${Math.floor(m/60)}시간`;

  return (
    <div className="reco-container">
      <div className="search-panel">
        <h1>🤖 AI 맞춤 추천</h1>
        
        <div className="steam-dashboard">
            {!user ? (
                <div className="steam-guest-msg">
                    <span>로그인하고 내 스팀 게임 기록을 분석받아보세요!</span>
                    <Link to="/login" className="search-btn">로그인</Link>
                </div>
            ) : (
                <>
                    {(steamStatus === 'NOT_LINKED' || steamStatus === 'ERROR') && (
                        <div className="steam-connect-box">
                            <span>스팀 계정을 연동하면 더 정확한 추천을 받습니다.</span>
                            <button onClick={handleLinkSteam} className="search-btn">🎮 Steam 연동</button>
                        </div>
                    )}
                    {steamStatus === 'PRIVATE' && <div className="steam-error">🔒 스팀 프로필이 비공개 상태입니다.</div>}
                    {steamStatus === 'LINKED' && (
                        <>
                            <div className="steam-header">
                                <h3 style={{margin:0, color:'#46d369'}}>✅ {user.username}님의 TOP 5</h3>
                                {/* ★ 연동 해제 버튼 */}
                                <button 
                                    onClick={handleUnlinkSteam} 
                                    style={{background:'none', border:'1px solid #555', color:'#aaa', fontSize:'12px', padding:'4px 8px', borderRadius:'4px', cursor:'pointer'}}
                                >
                                    연동 해제
                                </button>
                            </div>
                            <div className="steam-list">
                                {topGames.map((g, i) => {
                                    const maxPlaytime = topGames[0].playtime_forever || 1;
                                    const percent = Math.min(100, (g.playtime_forever / maxPlaytime) * 100);
                                    return (
                                        <div key={i} className="steam-card">
                                            <img src={`http://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`} className="steam-game-icon" alt="" onError={(e)=>e.target.src=FALLBACK_IMAGE}/>
                                            <div className="steam-info-col">
                                                <div className="steam-row-top">
                                                    <span className="steam-game-name" title={g.name}>{g.name}</span>
                                                    <span className="steam-playtime">{formatPlaytime(g.playtime_forever)}</span>
                                                </div>
                                                <div className="steam-playtime-bar"><div style={{ width: `${percent}%` }}></div></div>
                                                <div className="steam-tags">
                                                    {g.smart_tags && g.smart_tags.length > 0 ? (
                                                        g.smart_tags.slice(0, 3).map((t, idx) => (<span key={idx} className="steam-tag">{t}</span>))
                                                    ) : (<span className="steam-tag-empty">태그 데이터 없음</span>)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>

        <div className="search-row">
          <input className="search-input" value={term} onChange={(e)=>setTerm(e.target.value)} placeholder="게임 제목 검색..." />
        </div>
        
        <div className="tags-panel">
            {Object.entries(TAG_CATEGORIES).map(([group, list]) => (
                <div className="tag-group" key={group}>
                    <div className="tag-label">{group}</div>
                    <div className="tag-list">
                        {list.map(t => {
                            const isSelected = picked.has(t);
                            const isDisabled = picked.size > 0 && !validTags.includes(t) && !isSelected;

                            return (
                                <div 
                                    key={t} 
                                    className={`tag-chip ${isSelected ? 'on' : ''}`} 
                                    onClick={() => toggle(t)}
                                    style={isDisabled ? { 
                                        opacity: 0.3, 
                                        cursor: 'not-allowed', 
                                        backgroundColor: '#222', 
                                        color: '#555',
                                        border: '1px solid #333'
                                    } : {}}
                                >
                                    {t}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
      </div>

      {loading ? (
          <div className="loading-box">
              <div style={{fontSize:'2rem', marginBottom:'10px'}}>🔮</div>
              분석 중...
          </div>
      ) : (
        <div className="result-panel">
            <h2>✨ 추천 결과</h2>
            <RecoSection title="🌟 종합 추천 (BEST)" games={data.overall} />
            <RecoSection title="🔥 지금 뜨는 트렌드" games={data.trend} />
            <RecoSection title="🎯 선택하신 취향 저격" games={data.tag} />
            <RecoSection title="⏳ 플레이 타임 보장 명작" games={data.playtime} />
        </div>
      )}
      {!loading && err && <div className="error-box">{err}</div>}
    </div>
  );
}

export default PersonalRecoPage;
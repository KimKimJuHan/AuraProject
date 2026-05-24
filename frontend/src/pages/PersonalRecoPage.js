import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from 'axios'; 
import "../styles/Recommend.css"; 
import { API_BASE_URL, apiClient } from '../config'; 
import { formatPrice } from '../utils/priceFormatter';
import PcCompatibilityBadge from '../components/PcCompatibilityBadge';

const FALLBACK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const TAG_CATEGORIES = {
  '장르':   ['RPG', 'FPS', '액션', '어드벤처', '전략', '턴제', '시뮬레이션', '퍼즐', '플랫포머', '공포', '생존', '로그라이크', '소울라이크', '메트로배니아', '리듬', '격투', '카드게임', 'MOBA', '배틀로얄', '비주얼노벨'],
  '시점':   ['1인칭', '3인칭', '쿼터뷰', '탑다운', '횡스크롤'],
  '그래픽': ['픽셀아트', '2D', '3D', '애니메이션풍', '현실적', '귀여운', '힐링', '캐주얼'],
  '테마':   ['판타지', '다크판타지', 'SF', '우주', '사이버펑크', '스팀펑크', '중세', '역사', '좀비', '포스트아포칼립스', '전쟁', '밀리터리', '현대', '느와르'],
  '특징':   ['오픈월드', '샌드박스', '스토리', '선택지', '멀티엔딩', '고난이도', '협동', '로컬협동', 'PvP', '경쟁', '멀티플레이', '싱글플레이', '캐릭터커스텀', '자원관리', '기지건설'],
};

function GameCard({ game, userWishlist, onToggleWishlist, user }) {
    const isWishlisted = userWishlist.includes(game.slug);

    const handleHeartClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
            alert("로그인이 필요한 기능입니다.");
            return;
        }
        onToggleWishlist(game.slug, isWishlisted);
    };

    return (
        <Link to={`/game/${game.slug || `steam-${game.appid}`}`} className="game-card">
            <div className="thumb-wrapper">
                <img src={game.main_image || game.thumb || FALLBACK_IMAGE} className="thumb" alt={game.title_ko || game.name} onError={(e) => { e.target.src = FALLBACK_IMAGE; }} />
                <div className="net-card-gradient"></div>
                <button className="heart-btn" onClick={handleHeartClick}>{isWishlisted ? '♥' : '♡'}</button>
            </div>
            <div className="card-info">
                <div className="game-title">{game.title_ko || game.title || game.name}
                <PcCompatibilityBadge game={game} compact /></div>
                <div className="game-meta-row">
                    {/* ★ 가격 포매터 유틸리티 적용 */}
                    <span className="game-price" style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 'bold' }}>
                        {formatPrice(game.price_info, 'KR')}
                    </span>
                </div>
                {game.reason && (
                    <div style={{ fontSize: '11px', color: '#E50914', marginTop: '6px', fontWeight: 'bold', lineHeight: '1.3', wordBreak: 'keep-all' }}>
                        {game.reason}
                    </div>
                )}
            </div>
        </Link>
    );
}

function RecoSection({ title, games, userWishlist, onToggleWishlist, user }) {
    const COLS = 5;
    const [visibleCount, setVisibleCount] = useState(COLS);
    if (!games || games.length === 0) return null;
    const displayGames = games.slice(0, visibleCount);
    const hasMore = games.length > visibleCount;

    return (
        <div style={{ marginBottom: '50px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'15px', borderBottom:'1px solid var(--border)', paddingBottom:'10px' }}>
                <h3 style={{ margin:0, fontSize:'22px', color:'#e50914' }}>{title}</h3>
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                    {hasMore && (
                        <button onClick={() => setVisibleCount(v => v + COLS)}
                            style={{ background:'none', border:'1px solid #555', color:'var(--text-secondary)', cursor:'pointer', padding:'4px 12px', borderRadius:'4px', fontSize:'12px' }}>
                            더보기 +{Math.min(COLS, games.length - visibleCount)}
                        </button>
                    )}
                    {visibleCount > COLS && (
                        <button onClick={() => setVisibleCount(COLS)}
                            style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:'12px', textDecoration:'underline' }}>
                            접기
                        </button>
                    )}
                </div>
            </div>
            <div className="net-cards">
                {displayGames.map((g, i) => (
                    <GameCard
                        key={g.slug || i}
                        game={g}
                        userWishlist={userWishlist}
                        onToggleWishlist={onToggleWishlist}
                        user={user}
                    />
                ))}
            </div>
        </div>
    );
}

export default function PersonalRecoPage({ user }) {
  const isLight = document.body.classList.contains('light-mode');
  const term = ""; // 검색어 필드 (추후 검색창 UI 추가 시 useState로 교체)
  const [picked, setPicked] = useState(new Set());
  const [data, setData] = useState({ comprehensive: [], costEffective: [], trend: [], hiddenGem: [], multiplayer: [] });
  const [tagSpecificData, setTagSpecificData] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [userWishlist, setUserWishlist] = useState([]);

  // DB 위시리스트 로드
  useEffect(() => {
    if (user && user._id) {
        apiClient.get('/user/wishlist')
            .then(res => setUserWishlist(res.data || []))
            .catch(() => setUserWishlist([]));
    } else {
        setUserWishlist([]);
    }
  }, [user]);

  // DB 위시리스트 토글
  const handleToggleWishlist = async (gameSlug, isCurrentlyWished) => {
    if (isCurrentlyWished) {
        setUserWishlist(prev => prev.filter(s => s !== gameSlug));
    } else {
        setUserWishlist(prev => [...prev, gameSlug]);
    }
    try {
        if (isCurrentlyWished) {
            await apiClient.delete(`/user/wishlist/${gameSlug}`);
        } else {
            await apiClient.post('/user/wishlist', { slug: gameSlug });
        }
    } catch {
        // 롤백
        if (isCurrentlyWished) {
            setUserWishlist(prev => [...prev, gameSlug]);
        } else {
            setUserWishlist(prev => prev.filter(s => s !== gameSlug));
        }
        alert("찜하기 처리 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    const fetchReco = async () => {
        setErr(""); setLoading(true);
        try {
          const tagsArray = Array.from(picked);
          
          // 1. 기존 맞춤형 추천 API 호출
          const res = await axios.post(`${API_BASE_URL}/api/recommend/reco`, { 
              userId: user?._id, tags: tagsArray, term 
          }, { withCredentials: true });
          
          if (res.data.success && res.data.data) {
              setData(res.data.data);
          }

          // ★ 2. 유저가 태그를 눌렀을 때만 작동하는 '태그 전용 검색 API' 호출
          if (tagsArray.length > 0) {
              const tagRes = await axios.post(`${API_BASE_URL}/api/recommend`, {
                  tags: tagsArray,
                  sortBy: 'popular', // 태그가 최우선이므로 기본 인기순 정렬
                  playerType: user?.playerType || 'beginner'
              });
              
              if (tagRes.data.success) {
                  setTagSpecificData(tagRes.data.games);
              }
          } else {
              setTagSpecificData([]);
          }

        } catch (e) { setErr("데이터 로딩 실패"); } 
        finally { setLoading(false); }
    };
    const timer = setTimeout(() => { fetchReco(); }, 500);
    return () => clearTimeout(timer);
  }, [picked, user]); 

  const toggle = (t) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  return (
    <div className="reco-container">

      {/* 비로그인 안내 배너 */}
      {!user && (
        <div style={{
          background: isLight ? '#fff' : '#1a1a1a',
          border:'1px solid #E50914', borderRadius:'10px',
          padding:'16px 20px', marginBottom:'20px',
          display:'flex', alignItems:'center',
          justifyContent:'space-between', flexWrap:'wrap', gap:'12px'
        }}>
          <div>
            <div style={{fontWeight:'bold', color:'var(--text-primary)', marginBottom:'4px'}}>더 정확한 추천을 받으려면 로그인하세요</div>
            <div style={{color:'var(--text-muted)', fontSize:'13px'}}>Steam 연동 시 플레이 이력을 분석해 맞춤 추천을 드립니다.</div>
          </div>
          <div style={{display:'flex', gap:'8px'}}>
            <a href="/login" style={{background:'#E50914', color:'var(--text-primary)', padding:'8px 18px', borderRadius:'6px', textDecoration:'none', fontWeight:'bold', fontSize:'13px'}}>로그인</a>
            <a href="/signup" style={{background:'transparent', color:'var(--text-secondary)', padding:'8px 18px', borderRadius:'6px', textDecoration:'none', border:'1px solid #555', fontSize:'13px'}}>회원가입</a>
          </div>
        </div>
      )}

      {/* Steam 미연동 안내 */}
{user && !user.steamId && (
  <div style={{
    background: isLight ? '#fff' : '#1a1a1a', border:'1px solid var(--border)', borderRadius:'10px',
    padding:'14px 20px', marginBottom:'20px',
    display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'10px'
  }}>
    <div style={{color:'var(--text-secondary)', fontSize:'13px'}}>
      <span style={{color:'#66c0f4', fontWeight:'bold'}}>Steam 연동</span>하면 플레이 이력 기반 맞춤 추천을 받을 수 있습니다.
    </div>
    <a href="/mypage" style={{color:'#66c0f4', fontSize:'13px', textDecoration:'underline'}}>마이페이지에서 연동하기</a>
  </div>
)}
{user && user.steamId && (
  <div style={{
    background: isLight ? '#fff' : '#1a1a1a', border:'1px solid var(--border)', borderRadius:'10px',
    padding:'14px 20px', marginBottom:'20px'
  }}>
    <span style={{color:'#46d369', fontSize:'13px', fontWeight:'bold'}}>✅ 이미 Steam 연동이 되어 있습니다</span>
  </div>
)}

      <div className="search-panel">
        <h1>게임 맞춤 추천</h1>
        <div className="tags-panel">
            {Object.entries(TAG_CATEGORIES).map(([group, list]) => (
                <div className="tag-group" key={group}>
                    <div className="tag-label">{group}</div>
                    <div className="tag-list">
                        {list.map(t => (
                            <div key={t} className={`tag-chip ${picked.has(t) ? 'on' : ''}`} onClick={() => toggle(t)}>{t}</div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
      </div>

      {loading ? (
          <div className="loading-box"><div style={{fontSize:'2rem', marginBottom:'10px'}}>🔮</div>분석 중...</div>
      ) : (
        <div className="result-panel">
            <h2>✨ 추천 결과</h2>
            {/* ★ 기획 적용: 사용자가 선택한 태그가 있다면 그 태그에 찰떡인 게임 탭을 가장 최상단에 생성 */}
            {picked.size > 0 && tagSpecificData.length > 0 && (
                <RecoSection 
                    title={`[${Array.from(picked).join(', ')}] 취향 저격`} 
                    games={tagSpecificData}
                    userWishlist={userWishlist}
                    onToggleWishlist={handleToggleWishlist}
                    user={user}
                />
            )}
            
            <RecoSection title="종합 추천" games={data.comprehensive} userWishlist={userWishlist} onToggleWishlist={handleToggleWishlist} user={user} />
            <RecoSection title="지금 뜨는 트렌드" games={data.trend} userWishlist={userWishlist} onToggleWishlist={handleToggleWishlist} user={user} />
            <RecoSection title="가성비 추천" games={data.costEffective} userWishlist={userWishlist} onToggleWishlist={handleToggleWishlist} user={user} />
            <RecoSection title="숨겨진 명작" games={data.hiddenGem} userWishlist={userWishlist} onToggleWishlist={handleToggleWishlist} user={user} />
            <RecoSection title="멀티플레이 추천" games={data.multiplayer} userWishlist={userWishlist} onToggleWishlist={handleToggleWishlist} user={user} />
        </div>
      )}
      {!loading && err && <div className="error-box">{err}</div>}
    </div>
  );
}
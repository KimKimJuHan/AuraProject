import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from 'axios'; 
import "../styles/Recommend.css"; 
import { API_BASE_URL } from '../config'; 
import { safeLocalStorage } from '../utils/storage'; 
import { formatPrice } from '../utils/priceFormatter'; // ★ 가격 표시 유틸리티 임포트

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
    
    useEffect(() => {
        const wishlist = JSON.parse(safeLocalStorage.getItem('gameWishlist') || '[]');
        setIsWishlisted(wishlist.includes(game.slug));
    }, [game.slug]);

    const toggleWishlist = (e) => {
        e.preventDefault();
        const wishlist = JSON.parse(safeLocalStorage.getItem('gameWishlist') || '[]');
        let newWishlist;
        if (isWishlisted) newWishlist = wishlist.filter(slug => slug !== game.slug);
        else newWishlist = [...wishlist, game.slug];
        safeLocalStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
        setIsWishlisted(!isWishlisted);
    };

    return (
        <Link to={`/game/${game.slug || `steam-${game.appid}`}`} className="game-card">
            <div className="thumb-wrapper">
                <img src={game.main_image || game.thumb || FALLBACK_IMAGE} className="thumb" alt={game.title_ko || game.name} onError={(e) => { e.target.src = FALLBACK_IMAGE; }} />
                <div className="net-card-gradient"></div>
                <button className="heart-btn" onClick={toggleWishlist}>{isWishlisted ? '❤️' : '🤍'}</button>
            </div>
            <div className="card-info">
                <div className="game-title">{game.title_ko || game.title || game.name}</div>
                <div className="game-meta-row">
                    {/* ★ 가격 포매터 유틸리티 적용 */}
                    <span className="game-price" style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>
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

function RecoSection({ title, games }) {
    const [expanded, setExpanded] = useState(false);
    if (!games || games.length === 0) return null;
    const displayGames = expanded ? games : games.slice(0, 4);

    return (
        <div style={{ marginBottom: '50px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'15px', borderBottom:'1px solid #333', paddingBottom:'10px' }}>
                <h3 style={{ margin:0, fontSize:'22px', color:'#e50914' }}>{title}</h3>
                {games.length > 4 && (
                    <button onClick={() => setExpanded(!expanded)} style={{ background:'none', border:'none', color:'#ccc', cursor:'pointer', textDecoration:'underline' }}>
                        {expanded ? '접기' : '더보기 +'}
                    </button>
                )}
            </div>
            <div className="game-grid">
                {displayGames.map((g, i) => <GameCard key={g.slug || i} game={g} />)}
            </div>
        </div>
    );
}

export default function PersonalRecoPage({ user }) {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [data, setData] = useState({ comprehensive: [], costEffective: [], trend: [], hiddenGem: [], multiplayer: [] });
  // ★ 유저가 선택한 태그 전용 추천을 담을 State 추가
  const [tagSpecificData, setTagSpecificData] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

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
  }, [picked, term, user]); 

  const toggle = (t) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  return (
    <div className="reco-container">
      <div className="search-panel">
        <h1>🤖 게임 맞춤 추천</h1>
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
                    title={`🎯 [${Array.from(picked).join(', ')}] 취향 저격`} 
                    games={tagSpecificData} 
                />
            )}
            
            {/* 기존 넷플릭스 탭들 */}
            <RecoSection title="🌟 종합 추천 (맞춤형)" games={data.comprehensive} />
            <RecoSection title="🔥 지금 뜨는 트렌드" games={data.trend} />
            <RecoSection title="💰 가격 합리성 (가성비)" games={data.costEffective} />
            <RecoSection title="💎 숨겨진 명작" games={data.hiddenGem} />
            <RecoSection title="🤝 친구와 함께 (멀티플레이)" games={data.multiplayer} />
        </div>
      )}
      {!loading && err && <div className="error-box">{err}</div>}
    </div>
  );
}
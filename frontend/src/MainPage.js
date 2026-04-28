import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Skeleton from './Skeleton';
import { API_BASE_URL, apiClient } from './config'; // ★ 백엔드 통신을 위해 apiClient 추가
import { formatPrice } from './utils/priceFormatter';
import MinSpecChecker from "./MinSpecChecker";

const TAG_CATEGORIES = {
  '장르': ['RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '리듬', '액션', '어드벤처'],
  '시점': ['1인칭', '3인칭', '쿼터뷰', '횡스크롤'],
  '그래픽': ['픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', '귀여운'],
  '테마': ['판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', '전쟁', '포스트아포칼립스'],
  '특징': ['오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', '캐릭터 커스터마이즈', '협동 캠페인', '경쟁/PvP', '소울라이크']
};

const styles = {
  tabContainer: { display: 'flex', gap:'20px', marginBottom:'20px', borderBottom:'1px solid #333', paddingBottom:'1px' },
  tabButton: { background: 'none', color: '#b3b3b3', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid transparent', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px', transition: 'color 0.2s' },
  tabButtonActive: { background: 'none', color: '#fff', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid #E50914', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px' },
  loadMoreButton: { display: 'block', margin: '40px auto', padding: '12px 30px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid #fff', cursor: 'pointer', borderRadius:'4px', fontSize:'16px' },
  filterContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '40px', alignItems: 'start' },
  filterBox: { backgroundColor: '#181818', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', transition: 'all 0.3s ease' },
  filterHeader: { padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: '#222', borderBottom: '1px solid #333', userSelect: 'none' },
  filterTitle: { fontSize: '14px', color: '#ddd', fontWeight: 'bold' },
  filterArrow: { color: '#666', fontSize: '12px' },
  filterContent: { padding: '15px', display: 'flex', flexWrap: 'wrap', gap: '8px', backgroundColor: '#181818', borderTop: '1px solid #333' },
  tagBtn: { backgroundColor: '#333', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer', transition: '0.2s' },
  tagBtnActive: { backgroundColor: '#E50914', borderColor: '#E50914', color: 'white', fontWeight: 'bold', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer' },
  tagBtnDisabled: { backgroundColor: '#222', border: '1px solid #2a2a2a', color: '#444', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'not-allowed', opacity: 0.5 },
  heartBtn: { position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '16px', zIndex: 5 }
};

const FilterCategoryBox = ({ title, tags, selectedTags, onToggleTag, validTags }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasSelection = selectedTags.length > 0;
  const shouldUseRestriction = hasSelection && selectedTags.length >= 2 && validTags.length > 0;

  return (
      <div style={styles.filterBox}>
          <div style={styles.filterHeader} onClick={() => setIsOpen(!isOpen)}>
              <span style={styles.filterTitle}>{title}</span>
              <span style={styles.filterArrow}>{isOpen ? '▲' : '▼'}</span>
          </div>
          {isOpen && (
              <div style={styles.filterContent}>
                  {tags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      const isDisabled = shouldUseRestriction && !isSelected && !validTags.includes(tag);
                      return (
                          <button
                              key={tag}
                              style={isSelected ? styles.tagBtnActive : isDisabled ? styles.tagBtnDisabled : styles.tagBtn}
                              onClick={() => !isDisabled && onToggleTag(tag)}
                              disabled={isDisabled}
                          >
                              {tag}
                          </button>
                      );
                  })}
              </div>
          )}
      </div>
  );
};

// ★ [수술 완료] 로컬 스토리지 제거, MainPage에서 props로 전달받아 찜 상태 결정
function GameListItem({ game, region, userWishlist, onToggleWishlist, user }) {
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

  const currentPriceText = formatPrice(game.price_info, region);
  const discount = game.price_info?.discount_percent > 0 ? `-${game.price_info.discount_percent}%` : null;

  return (
    <Link to={`/game/${game.slug}`} className="net-card">
        <div className="net-card-thumb">
            <img src={game.main_image} alt={game.title} onError={(e) => e.target.src = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"} />
            <div className="net-card-gradient"></div>
            {discount && <div style={{position:'absolute', top:5, left:5, background:'#E50914', color:'white', padding:'2px 6px', borderRadius:'4px', fontSize:'12px', fontWeight:'bold'}}>{discount}</div>}
            <button style={styles.heartBtn} onClick={handleHeartClick}>{isWishlisted ? '❤️' : '🤍'}</button>
        </div>
        <div className="net-card-body">
            <div className="net-card-title">{game.title_ko || game.title}</div>
            <div style={{ color:'#38bdf8', fontSize:'12px', marginTop:'6px', marginBottom:'8px', lineHeight:'1.4', minHeight:'34px' }}>
              {game.reason || '이 조건에 잘 맞아 추천'}
            </div>
            <div className="net-card-footer">
                <div style={{display:'flex', flexDirection:'column'}}>
                    <span style={{color: currentPriceText === "무료" ? '#46d369' : '#fff', fontWeight:'bold', fontSize:'14px'}}>
                        {currentPriceText}
                    </span>
                </div>
            </div>
        </div>
    </Link>
  );
}

export default function MainPage({ user, region }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('popular');
  const [selectedTags, setSelectedTags] = useState([]);
  const [validTags, setValidTags] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  
  // ★ [핵심 추가] DB 연동형 위시리스트 상태 관리
  const [userWishlist, setUserWishlist] = useState([]);

  // 컴포넌트 마운트 및 유저 변경 시 DB에서 찜 목록 로드
  useEffect(() => {
    if (user && user._id) {
        apiClient.get('/user/wishlist')
            .then(res => setUserWishlist(res.data || []))
            .catch(err => console.error("찜 목록 로드 실패:", err));
    } else {
        setUserWishlist([]); // 로그아웃 상태면 초기화
    }
  }, [user]);

  // DB 연동 찜하기 토글 함수
  const handleToggleWishlist = async (gameSlug, isCurrentlyWished) => {
      if (isCurrentlyWished) {
          setUserWishlist(prev => prev.filter(slug => slug !== gameSlug));
      } else {
          setUserWishlist(prev => [...prev, gameSlug]);
      }

      try {
          if (isCurrentlyWished) {
              await apiClient.delete(`/user/wishlist/${gameSlug}`);
          } else {
              await apiClient.post(`/user/wishlist`, { slug: gameSlug });
          }
      } catch (err) {
          console.error("찜하기 DB 동기화 실패:", err);
          if (isCurrentlyWished) {
              setUserWishlist(prev => [...prev, gameSlug]);
          } else {
              setUserWishlist(prev => prev.filter(slug => slug !== gameSlug));
          }
          alert("찜하기 처리 중 서버 오류가 발생했습니다.");
      }
  };

  useEffect(() => {
    setGames([]);
    setPage(1);
    setHasMore(true);
  }, [selectedTags, activeTab]);

  useEffect(() => {
    if (page > 1 && !hasMore) return;

    const fetchGames = async () => {
        setLoading(true);
        setError(null);
        const currentPlayerType = user?.playerType || 'beginner';
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    tags: selectedTags, 
                    sortBy: activeTab, 
                    page,
                    playerType: currentPlayerType
                })
            });
            if (!response.ok) throw new Error("서버 연결 실패");
            const data = await response.json();

            if (data.validTags) setValidTags(data.validTags);

            setGames(prev => {
                if (page === 1) return data.games;
                const newGames = data.games.filter(g => !prev.some(p => p.slug === g.slug));
                return [...prev, ...newGames];
            });
            setHasMore(page < data.totalPages);
        } catch (err) {
            setError("서버와 연결할 수 없습니다.");
        } finally {
            setLoading(false);
        }
    };

    fetchGames();
  }, [page, selectedTags, activeTab, user]);

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  return (
    <div className="net-panel"> <MinSpecChecker />
      <div style={styles.tabContainer}>
        {[{ k:'popular', n:'인기 추천' }, { k:'new', n:'신규 출시' }, { k:'discount', n:'할인 중' }, { k:'price', n:'낮은 가격' }].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)} style={activeTab === t.k ? styles.tabButtonActive : styles.tabButton}>{t.n}</button>
        ))}
      </div>

      <div style={styles.filterContainer}>
          {Object.entries(TAG_CATEGORIES).map(([category, tags]) => (
              <FilterCategoryBox key={category} title={category} tags={tags} selectedTags={selectedTags} onToggleTag={toggleTag} validTags={validTags} />
          ))}
      </div>

      {selectedTags.length > 0 && (
        <div style={{marginBottom:'20px', color:'#b3b3b3', fontSize:'14px', textAlign:'right'}}>
            선택된 태그: <span style={{color:'white'}}>{selectedTags.join(', ')}</span>
            <button onClick={() => setSelectedTags([])} style={{marginLeft:'10px', background:'none', border:'none', color:'#E50914', cursor:'pointer', textDecoration:'underline'}}>초기화</button>
        </div>
      )}

      {error ? (
        <div style={{textAlign:'center', marginTop:'50px', color:'#ff4444', fontSize:'18px'}}>{error}</div>
      ) : (
        <div className="net-cards">
          {games.map(game => (
              <GameListItem 
                  key={game.slug} 
                  game={game} 
                  region={region} 
                  userWishlist={userWishlist} 
                  onToggleWishlist={handleToggleWishlist} 
                  user={user}
              />
          ))}
          {loading && Array(5).fill(0).map((_, i) => <Skeleton key={i} height="200px" />)}
        </div>
      )}

      {!loading && !error && hasMore && <button style={styles.loadMoreButton} onClick={() => setPage(p => p+1)}>더 보기 ∨</button>}
      {!loading && !error && games.length === 0 && <div style={{textAlign:'center', marginTop:'50px', color:'#666'}}>조건에 맞는 게임이 없습니다.</div>}
    </div>
  );
}
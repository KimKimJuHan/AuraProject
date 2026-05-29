import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Skeleton from './Skeleton';
import { API_BASE_URL, apiClient } from './config'; // ★ 백엔드 통신을 위해 apiClient 추가
import { formatPrice } from './utils/priceFormatter';
import MinSpecChecker from "./MinSpecChecker";

const TAG_CATEGORIES = {
  '장르':   ['RPG', 'FPS', '액션', '어드벤처', '전략', '턴제', '시뮬레이션', '퍼즐', '플랫포머', '공포', '생존', '로그라이크', '소울라이크', '메트로배니아', '리듬', '격투', '카드게임', 'MOBA', '배틀로얄', '비주얼노벨'],
  '시점':   ['1인칭', '3인칭', '쿼터뷰', '탑다운', '횡스크롤'],
  '그래픽': ['픽셀아트', '2D', '3D', '애니메이션풍', '현실적', '귀여운', '힐링', '캐주얼'],
  '테마':   ['판타지', '다크판타지', 'SF', '우주', '사이버펑크', '스팀펑크', '중세', '역사', '좀비', '포스트아포칼립스', '전쟁', '밀리터리', '현대', '느와르'],
  '특징':   ['오픈월드', '샌드박스', '스토리', '선택지', '멀티엔딩', '고난이도', '협동', '로컬협동', 'PvP', '경쟁', '멀티플레이', '싱글플레이', '캐릭터커스텀', '자원관리', '기지건설'],
};

const styles = {
  tabContainer: { display: 'flex', gap:'20px', marginBottom:'20px', borderBottom:'1px solid #333', paddingBottom:'1px' },
  tabButton: { background: 'none', color: '#b3b3b3', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid transparent', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px', transition: 'color 0.2s' },
  tabButtonActive: { background: 'none', color: '#fff', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid #E50914', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px' },
  loadMoreButton: { display: 'block', margin: '0 auto', padding: '10px 40px', backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', borderRadius:'20px', fontSize:'14px', transition:'all 0.15s' },
  filterContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '40px', alignItems: 'start' },
  filterBox: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', transition: 'all 0.3s ease' },
  filterHeader: { padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', userSelect: 'none' },
  filterTitle: { fontSize: '14px', color: 'var(--text-primary)', fontWeight: 'bold' },
  filterArrow: { color: 'var(--text-muted)', fontSize: '12px' },
  filterContent: { padding: '15px', display: 'flex', flexWrap: 'wrap', gap: '8px', backgroundColor: 'var(--bg-card)', borderTop: '1px solid #333' },
  tagBtn: { backgroundColor: '#333', border: '1px solid #444', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer', transition: '0.2s' },
  tagBtnActive: { backgroundColor: '#E50914', borderColor: '#E50914', color: 'white', fontWeight: 'bold', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer' },
  tagBtnDisabled: { backgroundColor: 'var(--bg-hover)', border: '1px solid #2a2a2a', color: '#444', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'not-allowed', opacity: 0.5 },
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
            <img src={game.main_image} alt={game.title} onError={(e) => e.target.src = "data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22300%22 height%3D%22169%22%3E%3Crect width%3D%22300%22 height%3D%22169%22 fill%3D%22%23202020%22%2F%3E%3Ctext x%3D%22150%22 y%3D%2290%22 font-family%3D%22sans-serif%22 font-size%3D%2214%22 fill%3D%22%23555%22 text-anchor%3D%22middle%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E"} />
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
  const [priceRange, setPriceRange] = useState('all');   // all / free / ~10000 / ~30000 / ~50000 / 50000+
  const [minDiscount, setMinDiscount] = useState(0);    // 0 / 10 / 30 / 50 / 75
  const [hideOwned, setHideOwned] = useState(false);    // 보유중인 게임 숨기기
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
  }, [selectedTags, activeTab, priceRange, minDiscount, hideOwned]);

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
                credentials: 'include',
                body: JSON.stringify({ 
                    userId: user?._id || null,
                    tags: selectedTags, 
                    sortBy: activeTab, 
                    page,
                    playerType: currentPlayerType,
                    priceRange,
                    minDiscount,
                    hideOwned
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
    <div className="net-panel"> <OnboardingPopup /><MinSpecChecker />
      {/* 정렬 & 필터 바 */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', marginBottom:'20px', alignItems:'flex-end' }}>

        {/* 정렬 */}
        <div>
          <div style={{ color:'#888', fontSize:'11px', marginBottom:'5px' }}>정렬</div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {[
              { k:'popular',  n:'인기순' },
              { k:'new',      n:'신작순' },
              { k:'discount', n:'할인율 높은순' },
              { k:'price',    n:'낮은 가격순' },
              { k:'review',   n:'평점순' },
            ].map(t => (
              <button key={t.k}
                onClick={() => { setActiveTab(t.k); setPage(1); setGames([]); }}
                style={{
                  padding:'6px 14px', borderRadius:'20px', fontSize:'13px', cursor:'pointer',
                  background: activeTab === t.k ? '#E50914' : 'var(--bg-hover)',
                  color: activeTab === t.k ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${activeTab === t.k ? '#E50914' : 'var(--border)'}`,
                  fontWeight: activeTab === t.k ? '700' : '400',
                  transition: 'all 0.15s',
                }}>
                {t.n}
              </button>
            ))}
          </div>
        </div>

        {/* 가격대 */}
        <div>
          <div style={{ color:'#888', fontSize:'11px', marginBottom:'5px' }}>가격대</div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {[
              { k:'all',    n:'전체' },
              { k:'free',   n:'무료' },
              { k:'~10000', n:'~1만원' },
              { k:'~30000', n:'~3만원' },
              { k:'~50000', n:'~5만원' },
              { k:'50000+', n:'5만원+' },
            ].map(p => (
              <button key={p.k}
                onClick={() => { setPriceRange(p.k); setPage(1); setGames([]); }}
                style={{
                  padding:'5px 12px', borderRadius:'20px', fontSize:'12px', cursor:'pointer',
                  background: priceRange === p.k ? '#333' : 'var(--bg-hover)',
                  color: priceRange === p.k ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${priceRange === p.k ? '#888' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>
                {p.n}
              </button>
            ))}
          </div>
        </div>

        {/* 할인율 */}
        <div>
          <div style={{ color:'#888', fontSize:'11px', marginBottom:'5px' }}>최소 할인율</div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {[
              { k:0,  n:'전체' },
              { k:10, n:'10%↑' },
              { k:30, n:'30%↑' },
              { k:50, n:'50%↑' },
              { k:75, n:'75%↑' },
            ].map(d => (
              <button key={d.k}
                onClick={() => { setMinDiscount(d.k); setPage(1); setGames([]); }}
                style={{
                  padding:'5px 12px', borderRadius:'20px', fontSize:'12px', cursor:'pointer',
                  background: minDiscount === d.k ? '#E50914' : 'var(--bg-hover)',
                  color: minDiscount === d.k ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${minDiscount === d.k ? '#E50914' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>
                {d.n}
              </button>
            ))}
          </div>
        </div>

        {/* 보유중인 게임 */}
        {user && (
          <div>
            <div style={{ color:'#888', fontSize:'11px', marginBottom:'5px' }}>보유 게임</div>
            <button
              onClick={() => { setHideOwned(v => !v); setPage(1); setGames([]); }}
              style={{ padding:'5px 14px', borderRadius:'20px', fontSize:'12px', cursor:'pointer',
                background: hideOwned ? '#E50914' : 'var(--bg-hover)',
                color: hideOwned ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${hideOwned ? '#E50914' : 'var(--border)'}`,
                transition: 'all 0.15s' }}>
              {hideOwned ? '보유 게임 숨김 중' : '보유 게임 표시'}
            </button>
          </div>
        )}

        {/* 초기화 */}
        {(priceRange !== 'all' || minDiscount !== 0 || hideOwned) && (
          <button onClick={() => { setPriceRange('all'); setMinDiscount(0); setHideOwned(false); setPage(1); setGames([]); }}
            style={{ padding:'5px 12px', borderRadius:'20px', fontSize:'12px', cursor:'pointer',
              background:'none', border:'1px solid #E50914', color:'#E50914' }}>
            필터 초기화
          </button>
        )}
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

      {!loading && !error && hasMore && (
        <div style={{ textAlign:'center', marginTop:'30px' }}>
          <button style={styles.loadMoreButton} onClick={() => setPage(p => p+1)}>
            게임 더 보기 ∨
          </button>
        </div>
      )}
      {!loading && !error && games.length === 0 && <div style={{textAlign:'center', marginTop:'50px', color:'#666'}}>조건에 맞는 게임이 없습니다.</div>}
    </div>
  );
}
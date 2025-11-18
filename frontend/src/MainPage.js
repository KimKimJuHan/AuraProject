import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Skeleton from './Skeleton';

const TAG_CATEGORIES = {
  '장르': ['RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '리듬', '액션'],
  '시점': ['1인칭', '3인칭', '쿼터뷰', '횡스크롤'],
  '그래픽': ['픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', '귀여운'],
  '테마': ['판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', '전쟁', '포스트아포칼립스'],
  '특징': ['오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', '캐릭터 커스터마이즈', '협동 캠페인', '경쟁/PvP', '소울라이크']
};

const styles = {
  tabContainer: { display: 'flex', gap:'20px', marginBottom:'20px', borderBottom:'1px solid #333', paddingBottom:'10px' },
  tabButton: { background: 'none', color: '#b3b3b3', border: 'none', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'5px 10px' },
  tabButtonActive: { color: '#fff', borderBottom: '3px solid #E50914', paddingBottom:'5px' },
  
  loadMoreButton: { display: 'block', margin: '40px auto', padding: '10px 30px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid #fff', cursor: 'pointer', borderRadius:'4px' },
  
  toggleBtn: { width: '100%', padding: '15px', backgroundColor: '#181818', border: '1px solid #333', color: '#fff', fontWeight:'bold', cursor:'pointer', display:'flex', justifyContent:'space-between', marginBottom:'20px', borderRadius: '8px' },

  // 필터 스타일
  filterContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
    gap: '15px',
    marginBottom: '30px'
  },
  filterBox: {
    backgroundColor: '#181818',
    border: '1px solid #333',
    borderRadius: '8px',
    overflow: 'hidden', 
    transition: 'all 0.3s ease'
  },
  filterHeader: {
    padding: '15px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    backgroundColor: '#222',
    borderBottom: '1px solid #333',
    userSelect: 'none'
  },
  filterTitle: {
    fontSize: '14px',
    color: '#ddd',
    fontWeight: 'bold'
  },
  filterArrow: {
    color: '#666',
    fontSize: '12px'
  },
  filterContent: {
    padding: '15px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    backgroundColor: '#181818'
  },
  tagBtn: {
    backgroundColor: '#333',
    border: '1px solid #444',
    color: '#ccc',
    padding: '5px 10px',
    borderRadius: '15px',
    fontSize: '12px',
    cursor: 'pointer',
    transition: '0.2s'
  },
  tagBtnActive: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
    color: 'white',
    fontWeight: 'bold',
    padding: '5px 10px',
    borderRadius: '15px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  heartBtn: { position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '16px', zIndex: 5, transition: 'transform 0.2s' }
};

// 개별 필터 박스 컴포넌트
const FilterCategoryBox = ({ title, tags, selectedTags, onToggleTag }) => {
    const [isOpen, setIsOpen] = useState(false); 

    return (
        <div style={styles.filterBox}>
            <div style={styles.filterHeader} onClick={() => setIsOpen(!isOpen)}>
                <span style={styles.filterTitle}>{title}</span>
                <span style={styles.filterArrow}>{isOpen ? '▲' : '▼'}</span>
            </div>
            
            {isOpen && (
                <div style={styles.filterContent}>
                    {tags.map(tag => (
                        <button 
                            key={tag} 
                            style={selectedTags.includes(tag) ? styles.tagBtnActive : styles.tagBtn}
                            onClick={() => onToggleTag(tag)}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

function GameListItem({ game }) {
  const [isWishlisted, setIsWishlisted] = useState(false);

  useEffect(() => {
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    setIsWishlisted(wishlist.includes(game.slug));
  }, [game.slug]);

  const toggleWishlist = (e) => {
    e.preventDefault(); 
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    let newWishlist;
    if (isWishlisted) {
        newWishlist = wishlist.filter(slug => slug !== game.slug);
    } else {
        newWishlist = [...wishlist, game.slug];
    }
    localStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
    setIsWishlisted(!isWishlisted);
  };

  const price = game.price_info;
  const isFree = price?.isFree;
  
  const currentPrice = price?.current_price ? `₩${price.current_price.toLocaleString()}` : "정보 없음";
  const regularPrice = price?.regular_price ? `₩${price.regular_price.toLocaleString()}` : null;
  const discount = price?.discount_percent > 0 ? `-${price.discount_percent}%` : null;

  return (
    <Link to={`/game/${game.slug}`} className="net-card">
        <div className="net-card-thumb">
            <img 
                src={game.main_image} 
                alt={game.title} 
                onError={(e) => e.target.src = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"} 
            />
            <div className="net-card-gradient"></div>
            {discount && <div style={{position:'absolute', top:5, left:5, background:'#E50914', color:'white', padding:'2px 6px', borderRadius:'4px', fontSize:'12px', fontWeight:'bold'}}>{discount}</div>}
            <button style={styles.heartBtn} onClick={toggleWishlist}>
                {isWishlisted ? '❤️' : '🤍'}
            </button>
        </div>
        
        <div className="net-card-body">
            <div className="net-card-title">{game.title_ko || game.title}</div>
            
            <div className="net-card-footer">
                <div style={{display:'flex', flexDirection:'column'}}>
                    {discount && regularPrice && (
                        <span style={{fontSize:'11px', color:'#777', textDecoration:'line-through'}}>{regularPrice}</span>
                    )}
                    <span style={{color: isFree ? '#46d369' : '#fff', fontWeight:'bold', fontSize:'14px'}}>
                        {isFree ? "무료" : currentPrice}
                    </span>
                </div>
                {game.smart_tags?.[0] && (
                    <span style={{fontSize:'10px', border:'1px solid #444', padding:'2px 4px', borderRadius:'2px', color:'#999', height:'fit-content'}}>
                        {game.smart_tags[0]}
                    </span>
                )}
            </div>
        </div>
    </Link>
  );
}

function MainPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'popular');
  const [selectedTags, setSelectedTags] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true); 
  // ★ [수정] 필터 토글 상태 (false: 접힘)
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const gameSlugs = useRef(new Set());

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
    setGames([]); setPage(1); setHasMore(true); gameSlugs.current.clear();
  }, [selectedTags, activeTab]);

  useEffect(() => {
    if (!hasMore) return; 
    setLoading(true);
    fetch('http://localhost:8000/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: selectedTags, sortBy: activeTab, page })
    }).then(r => r.json()).then(data => {
        const newGames = data.games.filter(g => !gameSlugs.current.has(g.slug));
        newGames.forEach(g => gameSlugs.current.add(g.slug));
        setGames(prev => [...prev, ...newGames]);
        setHasMore(page < data.totalPages); 
        setLoading(false);
    }).catch(err => console.error(err));
  }, [selectedTags, activeTab, page]);

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  return (
    <div className="net-panel">
      <div style={styles.tabContainer}>
        {[{ k:'popular', n:'🔥 인기' }, { k:'new', n:'✨ 신규' }, { k:'discount', n:'💸 할인' }, { k:'price', n:'💰 낮은 가격' }].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)} style={activeTab === t.k ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton}>{t.n}</button>
        ))}
      </div>

      {/* ★ 필터 토글 버튼 */}
      <button style={styles.toggleBtn} onClick={() => setIsFilterOpen(!isFilterOpen)}>
          <span>🔍 상세 필터 (장르/태그 선택) {selectedTags.length > 0 && <span style={{color:'#E50914'}}>({selectedTags.length})</span>}</span>
          <span>{isFilterOpen ? '▲ 접기' : '▼ 펼치기'}</span>
      </button>

      {/* ★ 필터 내용 (토글) */}
      {isFilterOpen && (
          <div style={styles.filterContainer}>
              {Object.entries(TAG_CATEGORIES).map(([category, tags]) => (
                  <FilterCategoryBox 
                      key={category} 
                      title={category} 
                      tags={tags} 
                      selectedTags={selectedTags} 
                      onToggleTag={toggleTag} 
                  />
              ))}
              <div style={{gridColumn: '1 / -1', textAlign:'right'}}>
                <button onClick={() => setSelectedTags([])} style={{background:'none', border:'none', color:'#E50914', cursor:'pointer', textDecoration:'underline'}}>
                    선택 초기화 ⟳
                </button>
              </div>
          </div>
      )}

      <div className="net-cards">
        {games.map(game => <GameListItem key={game.slug} game={game} />)}
        {loading && Array(5).fill(0).map((_, i) => <Skeleton key={i} height="200px" />)}
      </div>
      
      {!loading && hasMore && (
          <button style={styles.loadMoreButton} onClick={() => setPage(p => p+1)}>더 보기 ∨</button>
      )}
      
      {!loading && games.length === 0 && (
        <div style={{textAlign:'center', marginTop:'50px', color:'#666'}}>조건에 맞는 게임이 없습니다.</div>
      )}
    </div>
  );
}
export default MainPage;
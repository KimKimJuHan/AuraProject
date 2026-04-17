import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Skeleton from './Skeleton';
import { API_BASE_URL } from './config';

const TAG_CATEGORIES = {
  '난이도': ['초심자', '심화'],
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
                        const isDisabled = hasSelection && !isSelected && !validTags.includes(tag);

                        return (
                            <button 
                                key={tag} 
                                style={
                                    isSelected ? styles.tagBtnActive : 
                                    isDisabled ? styles.tagBtnDisabled : styles.tagBtn
                                } 
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

function GameListItem({ game, currency }) {
  const [isWishlisted, setIsWishlisted] = useState(false);

  useEffect(() => {
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    setIsWishlisted(wishlist.includes(game.slug));
  }, [game.slug]);

  const toggleWishlist = (e) => {
    e.preventDefault(); e.stopPropagation();
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    let newWishlist;
    if (isWishlisted) newWishlist = wishlist.filter(slug => slug !== game.slug);
    else newWishlist = [...wishlist, game.slug];
    localStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
    setIsWishlisted(!isWishlisted);
  };

  const price = game.price_info || {};
  
  const isKRW = currency === 'KRW';
  const displayPrice = isKRW 
      ? (price.current_price_krw !== undefined ? price.current_price_krw : price.current_price * 1350) 
      : price.current_price;
  
  const isFree = price.isFree || displayPrice === 0;
  
  const currencySymbol = isKRW ? '₩' : '$';
  const currentPriceText = isFree ? "무료" : (displayPrice !== undefined && displayPrice !== null ? `${currencySymbol}${displayPrice.toLocaleString()}` : "정보 없음");
  
  const discount = price.discount_percent > 0 ? `-${price.discount_percent}%` : null;

  return (
    <Link to={`/game/${game.slug}`} className="net-card">
        <div className="net-card-thumb">
            <img src={game.main_image} alt={game.title} onError={(e) => e.target.src = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"} />
            <div className="net-card-gradient"></div>
            {discount && <div style={{position:'absolute', top:5, left:5, background:'#E50914', color:'white', padding:'2px 6px', borderRadius:'4px', fontSize:'12px', fontWeight:'bold'}}>{discount}</div>}
            <button style={styles.heartBtn} onClick={toggleWishlist}>{isWishlisted ? '❤️' : '🤍'}</button>
        </div>
        <div className="net-card-body">
            <div className="net-card-title">{game.title_ko || game.title}</div>
            <div className="net-card-footer">
                <div style={{display:'flex', flexDirection:'column'}}>
                    <span style={{color: isFree ? '#46d369' : '#fff', fontWeight:'bold', fontSize:'14px'}}>
                        {currentPriceText}
                    </span>
                </div>
            </div>
        </div>
    </Link>
  );
}

function MainPage({ user }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('popular');
  const [selectedTags, setSelectedTags] = useState([]);
  const [validTags, setValidTags] = useState([]); 
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true); 
  const [error, setError] = useState(null);
  
  const [currency, setCurrency] = useState('KRW');

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
        try {
            const response = await fetch(`${API_BASE_URL}/api/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: selectedTags, sortBy: activeTab, page })
            });
            if (!response.ok) throw new Error("서버 연결 실패");
            const data = await response.json();
            
            if (data.validTags) {
                setValidTags(data.validTags);
            }

            setGames(prev => {
                if (page === 1) return data.games;
                const newGames = data.games.filter(g => !prev.some(p => p.slug === g.slug));
                return [...prev, ...newGames];
            });
            setHasMore(page < data.totalPages); 
        } catch (err) {
            console.error(err);
            setError("서버와 연결할 수 없습니다.");
        } finally {
            setLoading(false);
        }
    };
    
    fetchGames();
  }, [page, selectedTags, activeTab]); 

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  return (
    <div className="net-panel">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
        <select 
            value={currency} 
            onChange={(e) => setCurrency(e.target.value)}
            style={{ 
                backgroundColor: '#181818', color: '#fff', border: '1px solid #333', 
                padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', outline: 'none' 
            }}
        >
            <option value="KRW">🇰🇷 KRW (₩)</option>
            <option value="USD">🇺🇸 USD ($)</option>
        </select>
      </div>

      <div style={styles.tabContainer}>
        {[{ k:'popular', n:'🔥 인기' }, { k:'new', n:'✨ 신규' }, { k:'discount', n:'💸 할인' }, { k:'price', n:'💰 낮은 가격' }].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)} style={activeTab === t.k ? styles.tabButtonActive : styles.tabButton}>{t.n}</button>
        ))}
      </div>

      <div style={styles.filterContainer}>
          {Object.entries(TAG_CATEGORIES).map(([category, tags]) => (
              <FilterCategoryBox 
                key={category} 
                title={category} 
                tags={tags} 
                selectedTags={selectedTags} 
                onToggleTag={toggleTag} 
                validTags={validTags} 
              />
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
          {games.map(game => <GameListItem key={game.slug} game={game} currency={currency} />)}
          {loading && Array(5).fill(0).map((_, i) => <Skeleton key={i} height="200px" />)}
        </div>
      )}
      
      {!loading && !error && hasMore && <button style={styles.loadMoreButton} onClick={() => setPage(p => p+1)}>더 보기 ∨</button>}
      {!loading && !error && games.length === 0 && <div style={{textAlign:'center', marginTop:'50px', color:'#666'}}>조건에 맞는 게임이 없습니다.</div>}
    </div>
  );
}
export default MainPage;
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Skeleton from './Skeleton'; // ★ 스켈레톤 가져오기

const styles = {
  tabButtonActive: { background: '#3D46F2', color: '#FFFFFF', border: 'none', padding: '10px 15px', cursor: 'pointer', fontSize: '16px', marginRight: '5px', fontWeight: 'bold', borderRadius: '10px 10px 0 0', boxShadow: '0 -2px 0 #A24CD9 inset' },
  tabButton: { background: 'transparent', color: '#D494D9', border: 'none', padding: '10px 15px', cursor: 'pointer', fontSize: '16px', marginRight: '5px', borderRadius: '10px 10px 0 0' },
  tagButtonActive: { margin: '5px', backgroundColor: '#A24CD9', color: '#011526', border: '1px solid #A24CD9', padding: '0 10px', cursor: 'pointer', width: '120px', height: '35px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', borderRadius: '999px', fontWeight: 'bold' },
  tagButton: { margin: '5px', backgroundColor: '#021E73', color: '#FFFFFF', border: '1px solid #3D46F2', padding: '0 10px', cursor: 'pointer', width: '120px', height: '35px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', borderRadius: '999px' },
  listItem: { display: 'flex', alignItems: 'center', backgroundColor: '#021E73', color: 'white', textDecoration: 'none', marginBottom: '6px', padding: '10px', minHeight: '80px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.6)' },
  priceBox: { marginRight: '15px', width: '120px', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' },
  discountBadge: { backgroundColor: '#D94F4C', color: '#FFFFFF', padding: '4px 8px', borderRadius: '4px', fontSize: '18px', fontWeight: 'bold' },
  regularPrice: { textDecoration: 'line-through', color: '#BBBBBB', fontSize: '12px', marginTop: '4px' },
  currentPrice: { color: '#A24CD9', fontSize: '14px' },
  normalPrice: { color: '#FFFFFF', fontSize: '14px' },
  loadMoreButton: { display: 'block', width: '220px', margin: '20px auto', padding: '10px 15px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#048ABF', color: '#FFFFFF', border: 'none', borderRadius: '999px', boxShadow: '0 4px 12px rgba(0,0,0,0.7)' }
};

// ★ [신규] 로딩 중에 보여줄 뼈대 컴포넌트
function GameListItemSkeleton() {
  return (
    <div style={{...styles.listItem, pointerEvents: 'none'}}>
      {/* 이미지 자리 */}
      <Skeleton width="150px" height="69px" borderRadius="4px" style={{marginRight: '15px'}} />
      {/* 텍스트 자리 */}
      <div style={{ flex: 1 }}>
        <Skeleton width="60%" height="20px" />
        <Skeleton width="40%" height="14px" />
      </div>
      {/* 가격 자리 */}
      <div style={{ width: '100px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <Skeleton width="50px" height="20px" />
        <Skeleton width="80px" height="14px" />
      </div>
    </div>
  );
}

function GameListItem({ game }) {
  const detailPageUrl = `/game/${game.slug}`;

  const renderPrice = () => {
    if (!game.price_info) return <div style={styles.priceBox}><span style={styles.normalPrice}>-</span></div>;
    if (game.price_info.isFree) return <div style={styles.priceBox}><div style={styles.normalPrice}>무료</div></div>;
    if (game.price_info.regular_price === null) return <div style={styles.priceBox}><div style={styles.normalPrice}>정보 없음</div></div>;
    
    const { current_price, regular_price, discount_percent } = game.price_info;

    if (discount_percent > 0) {
      return (
        <div style={styles.priceBox}>
          <div style={styles.discountBadge}>-{discount_percent}%</div>
          <div style={styles.regularPrice}>₩{regular_price.toLocaleString()}</div>
          <div style={styles.currentPrice}>₩{current_price.toLocaleString()}</div>
        </div>
      );
    }
    return <div style={styles.priceBox}><div style={styles.normalPrice}>₩{regular_price.toLocaleString()}</div></div>;
  };

  return (
    <Link to={detailPageUrl} style={styles.listItem}>
      <img src={game.main_image} alt={game.title} style={{ width: '150px', height: '69px', borderRadius: '4px' }} />
      <div style={{ flex: 1, marginLeft: '15px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>{game.title}</h4>
      </div>
      {renderPrice()}
    </Link>
  );
}

function MainPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('popular'); 
  const [selectedTags, setSelectedTags] = useState([]);
  const allSmartTags = ['4인 협동', 'RPG', '오픈월드'];

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true); 
  const gameSlugs = useRef(new Set());

  useEffect(() => {
    setGames([]);
    setPage(1);
    setHasMore(true);
    gameSlugs.current.clear();
  }, [selectedTags, activeTab]);

  useEffect(() => {
    if (!hasMore) return; 

    async function fetchGames() {
      setLoading(true);
      try {
        const response = await fetch('http://localhost:8000/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: selectedTags, sortBy: activeTab, page: page })
        });
        const data = await response.json();
        
        const newGames = data.games.filter(game => {
          if (gameSlugs.current.has(game.slug)) return false;
          gameSlugs.current.add(game.slug);
          return true;
        });

        setGames(prevGames => [...prevGames, ...newGames]);
        setHasMore(page < data.totalPages); 
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    fetchGames();
  }, [selectedTags, activeTab, page, hasMore]); 

  const handleTagClick = (tag) => {
    setSelectedTags(prevTags => prevTags.includes(tag) ? prevTags.filter(t => t !== tag) : [...prevTags, tag]);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#011526', paddingBottom: '20px' }}>
      <div style={{ display: 'flex', padding: '10px 10px 0 10px' }}>
        {[
          { key: 'popular', name: '최고 인기' }, 
          { key: 'new', name: '신규 및 인기' },
          { key: 'discount', name: '특별 할인' },
          { key: 'price', name: '가격 (낮은 순)'}
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={activeTab === tab.key ? styles.tabButtonActive : styles.tabButton}>{tab.name}</button>
        ))}
      </div>
      <div style={{ padding: '10px', backgroundColor: '#021E73' }}>
        <strong>태그:</strong>
        {allSmartTags.map(tag => (
          <button key={tag} onClick={() => handleTagClick(tag)} style={selectedTags.includes(tag) ? styles.tagButtonActive : styles.tagButton}>{tag}</button>
        ))}
      </div>
      
      <div style={{ padding: '10px' }}>
        {/* ★ 게임 목록 렌더링 */}
        {games.map(game => (
            <GameListItem key={game.slug} game={game} />
        ))}
        
        {/* ★ [수정] 로딩 중이면 스켈레톤 5개 보여주기 */}
        {loading && (
           <>
             <GameListItemSkeleton />
             <GameListItemSkeleton />
             <GameListItemSkeleton />
             <GameListItemSkeleton />
             <GameListItemSkeleton />
           </>
        )}
        
        {!loading && hasMore && <button style={styles.loadMoreButton} onClick={() => setPage(prev => prev + 1)}>더 보기 (Load More)</button>}
        {!loading && games.length === 0 && <p style={{color:'white', textAlign:'center', marginTop:'20px'}}>게임이 없습니다.</p>}
      </div>
    </div>
  );
}
export default MainPage;
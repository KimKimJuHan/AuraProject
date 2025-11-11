// /frontend/src/MainPage.js

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// --- 스타일 객체 (버튼 높이 통일) ---
const styles = {
  tabButtonActive: { background: '#5FCDD9', color: '#172026', border: 'none', padding: '10px 15px', cursor: 'pointer', fontSize: '16px', marginRight: '5px', fontWeight: 'bold', borderRadius: '4px 4px 0 0' },
  tabButton: { background: 'none', color: '#FFFFFF', border: 'none', padding: '10px 15px', cursor: 'pointer', fontSize: '16px', marginRight: '5px', borderRadius: '4px 4px 0 0' },
  tagButtonActive: { margin: '5px', backgroundColor: '#04BFAD', color: '#172026', border: '1px solid #04BFAD', padding: '0 10px', cursor: 'pointer', width: '120px', height: '35px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' },
  tagButton: { margin: '5px', backgroundColor: '#027373', color: 'white', border: '1px solid #04BF9D', padding: '0 10px', cursor: 'pointer', width: '120px', height: '35px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' },
  listItem: { display: 'flex', alignItems: 'center', backgroundColor: '#027373', color: 'white', textDecoration: 'none', marginBottom: '2px', padding: '8px', minHeight: '80px', borderRadius: '3px' },
  priceBox: { marginRight: '15px', width: '120px', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' },
  discountBadge: { backgroundColor: '#04BFAD', color: '#172026', padding: '4px 8px', borderRadius: '3px', fontSize: '18px', fontWeight: 'bold' },
  regularPrice: { textDecoration: 'line-through', color: '#aaa', fontSize: '12px', marginTop: '4px' },
  currentPrice: { color: '#04BFAD', fontSize: '14px' },
  normalPrice: { color: '#eee', fontSize: '14px' },
  loadMoreButton: { display: 'block', width: '200px', margin: '20px auto', padding: '10px 15px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#5FCDD9', color: '#172026', border: 'none', borderRadius: '5px' }
};
// --- [스타일 끝] ---


// '게임 카드' 컴포넌트 (세로 목록)
function GameListItem({ game }) {
  const detailPageUrl = `/game/${game.slug}`;

  // ★ [수정] 가격 표시 로직 (무료, 0원, null 처리)
  const renderPrice = () => {
    if (!game.price_info) {
      return <div style={styles.priceBox}><span style={styles.normalPrice}>-</span></div>;
    }

    if (game.price_info.isFree === true) {
        return (
            <div style={styles.priceBox}>
                <div style={styles.normalPrice}>무료</div>
            </div>
        );
    }
    
    // ★ [수정] '0원' 버그 방지. Collector가 null로 보낸 경우
    if (game.price_info.regular_price === null) {
        return (
          <div style={styles.priceBox}>
            <div style={styles.normalPrice}>가격 정보 없음</div>
          </div>
        );
    }
    
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
    
    return (
      <div style={styles.priceBox}>
        <div style={styles.normalPrice}>
          ₩{regular_price.toLocaleString()}
        </div>
      </div>
    );
  };

  return (
    <Link to={detailPageUrl} style={styles.listItem}>
      <img src={game.main_image} alt={game.title} style={{ width: '150px', height: '69px' }} />
      <div style={{ flex: 1, marginLeft: '15px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>{game.title}</h4>
      </div>
      {renderPrice()}
    </Link>
  );
}

// 메인 페이지
function MainPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('popular'); 
  const [selectedTags, setSelectedTags] = useState([]);
  const allSmartTags = ['4인 협동', 'RPG', '오픈월드'];

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true); 
  
  // ★ [신규] '중복 키' 에러 방지를 위한 ID Set
  const gameSlugs = useRef(new Set());

  // 1. '필터' (탭, 태그)가 바뀔 때 실행되는 효과
  useEffect(() => {
    setGames([]);
    setPage(1);
    setHasMore(true);
    gameSlugs.current.clear(); // ★ [신규] ID Set 초기화
  }, [selectedTags, activeTab]);

  // 2. '데이터 요청' (필터 또는 페이지가 바뀔 때)
  useEffect(() => {
    // (페이지가 1이 아니거나, '더 보기'가 없으면 중복 실행 방지)
    if (page === 1 && games.length > 0) return; 
    if (!hasMore) return; 

    async function fetchGames() {
      setLoading(true);
      try {
        const response = await fetch('http://localhost:8000/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tags: selectedTags,
            sortBy: activeTab,
            page: page 
          })
        });
        if (!response.ok) throw new Error(`HTTP 에러! Status: ${response.status}`);
        
        const data = await response.json();
        
        // ★ [수정] '중복 키' 에러 방지 로직
        const newGames = data.games.filter(game => {
          if (gameSlugs.current.has(game.slug)) {
            return false; // 이미 있는 ID면 필터링
          }
          gameSlugs.current.add(game.slug); // 새 ID면 Set에 추가
          return true;
        });

        setGames(prevGames => [...prevGames, ...newGames]);
        setHasMore(page < data.totalPages); 

      } catch (err) {
        console.error("추천 API 호출 실패:", err);
      }
      setLoading(false);
    }
    
    fetchGames();
    
  }, [selectedTags, activeTab, page, hasMore, games.length]); // (의존성 배열 수정)

  // --- (핸들러 함수들은 이전과 동일) ---
  const handleTagClick = (tag) => {
    setSelectedTags(prevTags => 
      prevTags.includes(tag) ? prevTags.filter(t => t !== tag) : [...prevTags, tag]
    );
  };

  const renderTabs = () => {
    const tabs = [
      { key: 'popular', name: '최고 인기' }, 
      { key: 'new', name: '신규 및 인기' },
      { key: 'discount', name: '특별 할인' },
      { key: 'price', name: '가격 (낮은 순)'}
    ];
    return (
      <div style={{ display: 'flex', padding: '10px 10px 0 10px' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={activeTab === tab.key ? styles.tabButtonActive : styles.tabButton}
          >
            {tab.name}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div>
      {renderTabs()}
      <div style={{ padding: '10px', backgroundColor: '#027373' }}>
        <strong>태그:</strong>
        {allSmartTags.map(tag => (
          <button 
            key={tag}
            onClick={() => handleTagClick(tag)}
            style={selectedTags.includes(tag) ? styles.tagButtonActive : styles.tagButton}
          >
            {tag}
          </button>
        ))}
      </div>
      
      <div style={{ padding: '10px' }}>
        {games.map(game => (
            <GameListItem key={game.slug} game={game} />
        ))}
        
        {loading && <p>로딩 중...</p>}
        {!loading && hasMore && (
          <button 
            style={styles.loadMoreButton}
            onClick={() => setPage(prevPage => prevPage + 1)} 
          >
            더 보기 (Load More)
          </button>
        )}
        {!loading && !hasMore && games.length > 0 && <p>마지막 페이지입니다.</p>}
        {!loading && games.length === 0 && <p>선택된 태그에 맞는 게임이 없습니다.</p>}
      </div>
    </div>
  );
}
export default MainPage;
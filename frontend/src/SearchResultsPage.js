import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const styles = {
  container: { padding: '30px 40px', minHeight: '100vh', backgroundColor: '#11131F', color: '#FFFFFF' },
  filterSection: { border: '1px solid #2A2E3B', borderRadius: '12px', padding: '20px', marginBottom: '30px', backgroundColor: '#1A1D29' },
  categoryRow: { display: 'flex', marginBottom: '15px', alignItems: 'flex-start' },
  categoryTitle: { width: '100px', fontWeight: 'bold', color: '#A0AEC0', marginTop: '8px', fontSize: '14px' },
  tagsContainer: { flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px' },
  filterTag: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #3D46F2', backgroundColor: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s' },
  filterTagSelected: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #3D46F2', backgroundColor: '#3D46F2', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' },
  searchBarContainer: { display: 'flex', marginBottom: '20px', gap: '10px' },
  searchInput: { flex: 1, padding: '12px 20px', borderRadius: '8px', border: '1px solid #2A2E3B', backgroundColor: '#141721', color: 'white', fontSize: '16px', outline: 'none' },
  searchButton: { padding: '10px 25px', borderRadius: '8px', border: 'none', backgroundColor: '#3D46F2', color: 'white', fontWeight: 'bold', cursor: 'pointer' },
  resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', color: '#A0AEC0', fontSize: '14px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' },
  card: { backgroundColor: '#1A1D29', borderRadius: '12px', overflow: 'hidden', textDecoration: 'none', color: 'white', display: 'flex', flexDirection: 'column', border: '1px solid #2A2E3B', transition: 'transform 0.2s', height: '100%' },
  cardImage: { width: '100%', height: '160px', objectFit: 'cover' },
  cardBody: { padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  cardTitle: { fontSize: '16px', fontWeight: 'bold', marginBottom: '10px', lineHeight: '1.4' },
  cardFooter: { marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
};

const TAG_CATEGORIES = {
  '장르': ['RPG', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '리듬', 'FPS'],
  '시점': ['1인칭', '3인칭'],
  '그래픽스타일': ['픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', '귀여운'],
  '테마': ['판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', '전쟁', '포스트아포칼립스'],
  '특징': ['오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', '캐릭터 커스터마이즈', '협동 캠페인', '경쟁', 'PvP', 'PvE']
};

function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [localSearchTerm, setLocalSearchTerm] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);

  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const executeSearch = () => {
    setLoading(true);
    
    // 태그 기반으로 1차 데이터를 가져옴 (추천 API 사용)
    fetch('http://localhost:8000/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: selectedTags, sortBy: 'popular', page: 1 })
    })
    .then(res => res.json())
    .then(data => {
        let filtered = data.games;
        
        // 검색어가 있다면 2차 필터링 (한글/영어 모두 검색)
        if (localSearchTerm) {
            const lowerQuery = localSearchTerm.toLowerCase();
            filtered = filtered.filter(g => 
                g.title.toLowerCase().includes(lowerQuery) || 
                (g.title_ko && g.title_ko.toLowerCase().includes(lowerQuery)) // ★ 한글 제목 검색 추가
            );
        }
        setResults(filtered);
        setLoading(false);
    })
    .catch(err => {
        console.error(err);
        setLoading(false);
    });
  };

  useEffect(() => {
    executeSearch();
  }, [selectedTags]); 

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') executeSearch();
  };

  return (
    <div style={styles.container}>
      <div style={styles.searchBarContainer}>
        <input 
            style={styles.searchInput} 
            value={localSearchTerm}
            onChange={(e) => setLocalSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="검색어 (예: Baldur, 포탈...)"
        />
        <button style={styles.searchButton} onClick={executeSearch}>검색</button>
      </div>

      <div style={styles.filterSection}>
        {Object.entries(TAG_CATEGORIES).map(([category, tags]) => (
            <div key={category} style={styles.categoryRow}>
                <div style={styles.categoryTitle}>{category}</div>
                <div style={styles.tagsContainer}>
                    {tags.map(tag => (
                        <button 
                            key={tag}
                            style={selectedTags.includes(tag) ? styles.filterTagSelected : styles.filterTag}
                            onClick={() => toggleTag(tag)}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>
        ))}
        <div style={{textAlign: 'right', marginTop: '10px'}}>
            <span style={{fontSize:'13px', color:'#666', cursor:'pointer'}} onClick={() => setSelectedTags([])}>전체 해제</span>
        </div>
      </div>

      <div style={styles.resultHeader}>
        <span>결과 {results.length} 개</span>
      </div>

      {loading ? (
        <p>검색 중...</p>
      ) : (
        <div style={styles.grid}>
          {results.map(game => (
            <Link to={`/game/${game.slug}`} key={game.slug} style={styles.card}>
              <img 
                src={game.main_image} 
                alt={game.title} 
                style={styles.cardImage} 
                onError={(e) => e.target.src = "https://via.placeholder.com/300x160/1A1D29/FFFFFF?text=No+Image"}
              />
              <div style={styles.cardBody}>
                {/* ★ 제목 표시: 한글 제목이 있으면 우선 표시 */}
                <div style={styles.cardTitle}>{game.title_ko || game.title}</div>
                <div style={styles.cardFooter}>
                    {game.price_info?.isFree ? (
                        <span style={{color:'#48BB78', fontWeight:'bold'}}>무료</span>
                    ) : (
                        <>
                            <span style={{color:'#888', fontSize:'12px'}}>
                                {game.price_info?.regular_price ? '₩' + game.price_info.regular_price.toLocaleString() : ''}
                            </span>
                            <span style={{fontWeight:'bold'}}>
                                {game.price_info?.current_price ? '₩' + game.price_info.current_price.toLocaleString() : '가격 정보 없음'}
                            </span>
                        </>
                    )}
                </div>
                {game.metacritic_score > 0 && (
                    <div style={{marginTop:'10px'}}>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#ccc', marginBottom:'3px'}}>
                            <span>Metacritic</span>
                            <span>{game.metacritic_score}점</span>
                        </div>
                        <div style={{width:'100%', height:'4px', backgroundColor:'#333', borderRadius:'2px'}}>
                            <div style={{width:`${game.metacritic_score}%`, height:'100%', backgroundColor:'#3D46F2', borderRadius:'2px'}}></div>
                        </div>
                    </div>
                )}
              </div>
            </Link>
          ))}
          {results.length === 0 && (
            <div style={{gridColumn: '1 / -1', textAlign: 'center', marginTop: '50px', color: '#888'}}>
                <p>검색 결과가 없습니다.</p>
                <p style={{fontSize:'14px'}}>다른 검색어나 태그를 시도해 보세요.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchResultsPage;
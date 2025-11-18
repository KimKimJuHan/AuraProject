import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

// --- 스타일 객체 (팀원 디자인 반영) ---
const styles = {
  container: { 
    padding: '30px 40px', 
    minHeight: '100vh', 
    backgroundColor: '#11131F', // 더 어두운 배경 (이미지 참고)
    color: '#FFFFFF' 
  },
  // ★ 필터 섹션 (카테고리 박스)
  filterSection: {
    border: '1px solid #2A2E3B',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '30px',
    backgroundColor: '#1A1D29' // 패널 배경
  },
  categoryRow: {
    display: 'flex',
    marginBottom: '15px',
    alignItems: 'flex-start'
  },
  categoryTitle: {
    width: '100px',
    fontWeight: 'bold',
    color: '#A0AEC0',
    marginTop: '8px',
    fontSize: '14px'
  },
  tagsContainer: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  // ★ 태그 버튼 스타일 (이미지와 유사하게)
  filterTag: {
    padding: '6px 14px',
    borderRadius: '20px', // 둥근 알약 모양
    border: '1px solid #3D46F2',
    backgroundColor: 'transparent',
    color: '#94A3B8',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s'
  },
  filterTagSelected: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1px solid #3D46F2',
    backgroundColor: '#3D46F2', // 선택 시 밝은 파랑
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold'
  },
  
  // ★ 검색바 섹션
  searchBarContainer: {
    display: 'flex',
    marginBottom: '20px',
    gap: '10px'
  },
  searchInput: {
    flex: 1,
    padding: '12px 20px',
    borderRadius: '8px',
    border: '1px solid #2A2E3B',
    backgroundColor: '#141721',
    color: 'white',
    fontSize: '16px',
    outline: 'none'
  },
  searchButton: {
    padding: '10px 25px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#3D46F2',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer'
  },

  // ★ 결과 섹션
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    color: '#A0AEC0',
    fontSize: '14px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', // 반응형 그리드
    gap: '20px'
  },
  
  // ★ 카드 스타일 (이미지 비율, 라운딩)
  card: {
    backgroundColor: '#1A1D29',
    borderRadius: '12px',
    overflow: 'hidden',
    textDecoration: 'none',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #2A2E3B',
    transition: 'transform 0.2s',
    height: '100%'
  },
  cardImage: {
    width: '100%',
    height: '160px',
    objectFit: 'cover'
  },
  cardBody: {
    padding: '15px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between'
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '10px',
    lineHeight: '1.4'
  },
  cardFooter: {
    marginTop: 'auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  priceText: {
    color: '#3D46F2', // 가격 강조색
    fontWeight: 'bold'
  },
  discountText: {
    color: '#48BB78', // 할인율 (초록)
    fontSize: '12px',
    marginLeft: '5px'
  }
};

// ★ 카테고리별 태그 데이터 (이미지 기반)
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
  const [selectedTags, setSelectedTags] = useState([]); // 선택된 태그들

  // 태그 토글 함수
  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // 검색 실행 (API 호출)
  const executeSearch = () => {
    setLoading(true);
    
    // API에 보낼 데이터 준비
    const payload = {
        tags: selectedTags,
        sortBy: 'popular', // 기본 정렬
        page: 1
    };

    // 검색어가 있으면 자동완성 API 활용, 없으면 추천 API 활용 (필터링)
    // 여기서는 간단하게 'recommend' API를 재활용하되, 검색어 필터링은 프론트에서 하거나 백엔드 개선 필요.
    // ★ 현재 백엔드 구조상 '검색어' + '태그' 동시 검색 API가 없으므로
    //    일단 'recommend' API로 태그 기반 검색을 수행합니다.
    //    (텍스트 검색은 상단바에서 이미 수행했으므로)

    fetch('http://localhost:8000/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        // 만약 텍스트 검색어가 있다면, 결과에서 2차 필터링 (임시)
        let filtered = data.games;
        if (localSearchTerm) {
            filtered = filtered.filter(g => g.title.toLowerCase().includes(localSearchTerm.toLowerCase()));
        }
        setResults(filtered);
        setLoading(false);
    })
    .catch(err => {
        console.error(err);
        setLoading(false);
    });
  };

  // 페이지 로드 시 / 태그 변경 시 자동 검색
  useEffect(() => {
    executeSearch();
  }, [selectedTags]); // 태그가 바뀔 때마다 재검색

  // 엔터 키 입력 시 검색
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') executeSearch();
  };

  return (
    <div style={styles.container}>
      {/* 1. 상단 검색바 */}
      <div style={styles.searchBarContainer}>
        <input 
            style={styles.searchInput} 
            value={localSearchTerm}
            onChange={(e) => setLocalSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="검색어 (예: Baldur, Souls...)"
        />
        <button style={styles.searchButton} onClick={executeSearch}>추천 받기</button>
      </div>

      {/* 2. 카테고리별 필터 섹션 */}
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

      {/* 3. 결과 목록 */}
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
                <div style={styles.cardTitle}>{game.title}</div>
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
                {/* 진행 바 스타일의 평점 (임시 시각화) */}
                {game.metacritic_score > 0 && (
                    <div style={{marginTop:'10px'}}>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#ccc', marginBottom:'3px'}}>
                            <span>Metacritic</span>
                            <span>{game.metacritic_score}%</span>
                        </div>
                        <div style={{width:'100%', height:'4px', backgroundColor:'#333', borderRadius:'2px'}}>
                            <div style={{width:`${game.metacritic_score}%`, height:'100%', backgroundColor:'#3D46F2', borderRadius:'2px'}}></div>
                        </div>
                    </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchResultsPage;
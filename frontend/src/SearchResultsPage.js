import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Skeleton from './Skeleton';
import { API_BASE_URL } from './config';
import PcCompatibilityBadge from './components/PcCompatibilityBadge';

const REVIEW_KO = {
  'Overwhelmingly Positive': '압도적으로 긍정적',
  'Very Positive': '매우 긍정적',
  'Positive': '긍정적',
  'Mostly Positive': '대체로 긍정적',
  'Mixed': '복합적',
  'Mostly Negative': '대체로 부정적',
  'Negative': '부정적',
  'Overwhelmingly Negative': '압도적으로 부정적',
};

const styles = {
  container: { padding: '40px 5%', color: '#fff', minHeight: '100vh', backgroundColor: '#141414' },
  header: { fontSize: '24px', marginBottom: '16px', borderLeft: '5px solid #E50914', paddingLeft: '15px' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' },
  sortBtn: { background: '#2a2a2a', border: '1px solid #444', color: '#ccc', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  sortBtnActive: { background: '#E50914', border: '1px solid #E50914', color: '#fff', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' },
  card: { backgroundColor: '#181818', borderRadius: '4px', overflow: 'hidden', textDecoration: 'none', color: '#fff', transition: 'transform 0.2s', display: 'block' },
  thumbWrapper: { position: 'relative', width: '100%', paddingTop: '56.25%' },
  thumb: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
  cardBody: { padding: '10px' },
  title: { fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '5px' },
  meta: { fontSize: '12px', color: '#ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: '80px', color: '#bbb', fontSize: '18px' }
};

const SORT_OPTIONS = [
  { key: 'relevance', label: '관련도순' },
  { key: 'review', label: '평점순' },
  { key: 'price_asc', label: '낮은 가격순' },
  { key: 'price_desc', label: '높은 가격순' },
  { key: 'discount', label: '할인율순' },
  { key: 'new', label: '신작순' },
];

function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q');
  const [results, setResults] = useState([]);
  const [sorted, setSorted] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');

  useEffect(() => {
    if (!query) return;
    const fetchResults = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/search/results?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        setResults(data.games || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [query]);

  // 클라이언트 사이드 정렬
  useEffect(() => {
    if (results.length === 0) { setSorted([]); return; }
    const copy = [...results];
    if (sortBy === 'review') {
      copy.sort((a, b) => (b.steam_reviews?.overall?.percent || 0) - (a.steam_reviews?.overall?.percent || 0));
    } else if (sortBy === 'price_asc') {
      copy.sort((a, b) => {
        const pa = a.price_info?.isFree ? 0 : (a.price_info?.current_price || 999999);
        const pb = b.price_info?.isFree ? 0 : (b.price_info?.current_price || 999999);
        return pa - pb;
      });
    } else if (sortBy === 'price_desc') {
      copy.sort((a, b) => (b.price_info?.current_price || 0) - (a.price_info?.current_price || 0));
    } else if (sortBy === 'discount') {
      copy.sort((a, b) => (b.price_info?.discount_percent || 0) - (a.price_info?.discount_percent || 0));
    } else if (sortBy === 'new') {
      copy.sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0));
    }
    setSorted(copy);
  }, [results, sortBy]);

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>"{query}" 검색 결과 {!loading && `(${results.length}개)`}</h1>

      {!loading && results.length > 0 && (
        <div style={styles.toolbar}>
          <span style={{ color: '#888', fontSize: '13px' }}>정렬:</span>
          {SORT_OPTIONS.map(opt => (
            <button key={opt.key}
              style={sortBy === opt.key ? styles.sortBtnActive : styles.sortBtn}
              onClick={() => setSortBy(opt.key)}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={styles.grid}>
          {Array(10).fill(0).map((_, i) => <Skeleton key={i} height="250px" />)}
        </div>
      ) : sorted.length > 0 ? (
        <div style={styles.grid}>
          {sorted.map((game) => {
            const percent = game.steam_reviews?.overall?.percent || 0;
            const reviewColor = percent >= 80 ? '#66c0f4' : percent >= 60 ? '#d29922' : '#ff7b72';
            const reviewText = REVIEW_KO[game.steam_reviews?.overall?.summary] || '';
            const discount = game.price_info?.discount_percent;
            return (
              <Link to={`/game/${game.slug}`} key={game._id} style={styles.card} className="net-card">
                <div style={styles.thumbWrapper}>
                  {discount > 0 && (
                    <div style={{ position:'absolute', top:'8px', left:'8px', background:'#E50914',
                      color:'#fff', padding:'2px 6px', borderRadius:'4px', fontSize:'12px', fontWeight:'bold', zIndex:2 }}>
                      -{discount}%
                    </div>
                  )}
                  <img src={game.main_image} alt={game.title} style={styles.thumb}
                    onError={(e) => e.target.src = "https://via.placeholder.com/300x169?text=No+Image"} />
                </div>
                <div style={styles.cardBody}>
                  <div style={styles.title}>{game.title_ko || game.title}
                    <PcCompatibilityBadge game={game} compact /></div>
                  {percent > 0 && game.steam_reviews?.overall?.total >= 10 && (
                    <div style={{ marginBottom: '5px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', marginBottom:'2px' }}>
                        <span style={{ color: reviewColor }}>{reviewText}</span>
                        <span style={{ color:'#888' }}>{percent}%</span>
                      </div>
                      <div style={{ background:'#333', borderRadius:'2px', height:'3px' }}>
                        <div style={{ width:`${percent}%`, height:'100%', background: reviewColor, borderRadius:'2px' }}/>
                      </div>
                    </div>
                  )}
                  <div style={styles.meta}>
                    <span style={{ color: discount > 0 ? '#E50914' : '#fff', fontWeight: discount > 0 ? 'bold' : 'normal' }}>
                      {game.price_info?.isFree ? '무료' : (game.price_info?.current_price > 0 ? `₩${game.price_info.current_price.toLocaleString()}` : '가격 정보 없음')}
                    </span>
                    {game.metacritic_score > 0 && <span style={{ color:'#888' }}>MC {game.metacritic_score}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div style={styles.empty}>
          <div style={{ fontSize:'22px', marginBottom:'10px' }}>검색 결과가 없습니다</div>
          <div style={{ fontSize:'14px', color:'#888', marginBottom:'20px' }}>
            다른 키워드로 검색하거나 인기 게임을 확인해보세요
          </div>
          <Link to="/" style={{ background:'#E50914', color:'#fff', padding:'10px 20px',
            borderRadius:'4px', textDecoration:'none', fontWeight:'bold' }}>
            인기 게임 보러가기
          </Link>
        </div>
      )}
    </div>
  );
}

export default SearchResultsPage;
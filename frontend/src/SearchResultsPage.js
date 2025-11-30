import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Skeleton from './Skeleton';
import { API_BASE_URL } from './config'; // ★ 설정 파일 import

const styles = {
  container: { padding: '40px 5%', color: '#fff', minHeight: '100vh', backgroundColor: '#141414' },
  header: { fontSize: '24px', marginBottom: '20px', borderLeft: '5px solid #E50914', paddingLeft: '15px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' },
  card: { backgroundColor: '#181818', borderRadius: '4px', overflow: 'hidden', textDecoration: 'none', color: '#fff', transition: 'transform 0.2s', display: 'block' },
  thumbWrapper: { position: 'relative', width: '100%', paddingTop: '56.25%' },
  thumb: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
  cardBody: { padding: '10px' },
  title: { fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '5px' },
  meta: { fontSize: '12px', color: '#ccc', display: 'flex', justifyContent: 'space-between' },
  empty: { textAlign: 'center', marginTop: '50px', color: '#666', fontSize: '18px' }
};

function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) return;

    const fetchResults = async () => {
      setLoading(true);
      try {
        // ★ API 주소 변수 사용
        const response = await fetch(`${API_BASE_URL}/api/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchQuery: query }) // 검색어 전달
        });
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

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>🔍 "{query}" 검색 결과</h1>
      
      {loading ? (
        <div style={styles.grid}>
            {Array(10).fill(0).map((_, i) => <Skeleton key={i} height="250px" />)}
        </div>
      ) : results.length > 0 ? (
        <div style={styles.grid}>
          {results.map((game) => (
            <Link to={`/game/${game.slug}`} key={game._id} style={styles.card} className="net-card">
                <div style={styles.thumbWrapper}>
                    <img src={game.main_image} alt={game.title} style={styles.thumb} onError={(e) => e.target.src = "https://via.placeholder.com/300x169?text=No+Image"} />
                </div>
                <div style={styles.cardBody}>
                    <div style={styles.title}>{game.title_ko || game.title}</div>
                    <div style={styles.meta}>
                        <span>{game.price_info?.isFree ? '무료' : (game.price_info?.current_price ? `₩${game.price_info.current_price.toLocaleString()}` : '정보 없음')}</span>
                        {game.metacritic_score > 0 && <span>Ⓜ️ {game.metacritic_score}</span>}
                    </div>
                </div>
            </Link>
          ))}
        </div>
      ) : (
        <div style={styles.empty}>검색 결과가 없습니다.</div>
      )}
    </div>
  );
}

export default SearchResultsPage;
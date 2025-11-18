import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Skeleton from './Skeleton';

function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q');
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    fetch('http://localhost:8000/api/recommend', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ searchQuery: query })
    }).then(r => r.json()).then(data => {
        setGames(data.games);
        setLoading(false);
    });
  }, [query]);

  return (
    <div className="net-panel">
      <h2 className="net-section-title" style={{borderLeftColor:'#E50914'}}>"{query}" 검색 결과</h2>
      
      {loading ? (
          <div className="net-cards">
            {Array(5).fill(0).map((_, i) => <Skeleton key={i} height="250px" />)}
          </div>
      ) : games.length > 0 ? (
          <div className="net-cards">
            {games.map(game => (
                <Link to={`/game/${game.slug}`} key={game.slug} className="net-card">
                    <div className="net-card-thumb">
                        <img src={game.main_image} alt={game.title} onError={(e) => e.target.src = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"} />
                    </div>
                    <div className="net-card-body">
                        <div className="net-card-title">{game.title_ko || game.title}</div>
                        <div className="net-card-footer">
                           {game.price_info?.isFree ? <span style={{color:'#46d369'}}>무료</span> : (game.price_info?.current_price ? `₩${(Math.round(game.price_info.current_price/10)*10).toLocaleString()}` : "정보 없음")}
                        </div>
                    </div>
                </Link>
            ))}
          </div>
      ) : (
          <div className="net-empty">
             <p>검색 결과가 없습니다.</p>
          </div>
      )}
    </div>
  );
}
export default SearchResultsPage;
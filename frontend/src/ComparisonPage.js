import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from './config';

function ComparisonPage({ region, user }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWishlistGames = async () => {
      // 메인 페이지와 동일하게 로컬 스토리지에서 찜목록(slug 배열)을 가져옴
      const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
      
      if (wishlist.length === 0) {
        setGames([]);
        setLoading(false);
        return;
      }

      try {
        // 백엔드에 찜한 게임들의 slug 배열을 보내 데이터 요청
        const response = await apiClient.post('/recommend/wishlist', { slugs: wishlist });
        if (response.data.success) {
          setGames(response.data.games || []);
        }
      } catch (err) {
        console.error(err);
        setError("찜 목록 데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchWishlistGames();
  }, []);

  // 찜목록에서 삭제 기능
  const removeFromWishlist = (slug) => {
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    const newWishlist = wishlist.filter(id => id !== slug);
    localStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
    // 화면에서도 즉시 제거
    setGames(games.filter(g => g.slug !== slug));
  };

  if (loading) return <div style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>로딩 중...</div>;
  if (error) return <div style={{ color: '#ff4444', textAlign: 'center', marginTop: '50px' }}>{error}</div>;

  return (
    <div style={{ padding: '40px', color: '#fff', backgroundColor: '#141414', minHeight: '100vh' }}>
      <h2 style={{ borderBottom: '2px solid #E50914', paddingBottom: '10px', marginBottom: '20px' }}>❤️ 내 찜/비교 목록</h2>
      
      {games.length === 0 ? (
        <p style={{ color: '#bbb', textAlign: 'center', marginTop: '50px', fontSize: '18px' }}>
            찜한 게임이 없습니다. 메인 화면에서 하트를 눌러 게임을 추가해보세요.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
          {games.map(game => (
            <div key={game.slug} style={{ backgroundColor: '#181818', borderRadius: '8px', padding: '15px', border: '1px solid #333', position: 'relative' }}>
              
              <button onClick={() => removeFromWishlist(game.slug)} style={{ position: 'absolute', top: '10px', right: '10px', background: '#E50914', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '5px 10px', zIndex: 10 }}>
                삭제 ✕
              </button>
              
              <img src={game.main_image || game.header_image} alt={game.title} style={{ width: '100%', borderRadius: '4px', marginBottom: '15px' }} onError={(e) => e.target.src = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"} />
              
              <h3 style={{ fontSize: '18px', margin: '0 0 10px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {game.title_ko || game.title}
              </h3>
              
              <p style={{ fontSize: '14px', color: '#bbb', margin: '5px 0' }}>
                🔥 동접자: {game.steamPlayerCount?.toLocaleString() || 0}명
              </p>
              <p style={{ fontSize: '14px', color: '#bbb', margin: '5px 0' }}>
                💰 가격: {game.price_info?.isFree ? '무료' : (game.price_info?.current_price ? `₩${game.price_info.current_price.toLocaleString()}` : (game.price_overview?.final_formatted || '정보 없음'))}
              </p>

              <Link to={`/game/${game.slug || game._id}`} style={{ display: 'block', textAlign: 'center', backgroundColor: '#333', color: '#fff', textDecoration: 'none', padding: '10px', borderRadius: '4px', marginTop: '15px', fontWeight: 'bold' }}>
                상점 페이지로 이동
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ComparisonPage;
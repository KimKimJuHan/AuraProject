import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from './config';
import { formatPrice } from './utils/priceFormatter'; // ★ 가격 표시 유틸리티 임포트

function ComparisonPage({ region, user }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortOption, setSortOption] = useState('name');

  useEffect(() => {
    const fetchWishlistGames = async () => {
      const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
      
      if (wishlist.length === 0) {
        setGames([]);
        setLoading(false);
        return;
      }

      try {
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

  const removeFromWishlist = (slug) => {
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    const newWishlist = wishlist.filter(id => id !== slug);
    localStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
    setGames(games.filter(g => g.slug !== slug));
  };

  const getGameName = (game) => {
    return (game.title_ko || game.title || '').toLowerCase();
  };

  // 정렬을 위한 내부 가격 계산 로직 (표시용 아님)
  const getGamePrice = (game) => {
    if (game.price_info?.isFree) return 0;
    if (typeof game.price_info?.current_price === 'number') return game.price_info.current_price;
    return Number.MAX_SAFE_INTEGER;
  };

  const getDiscountPercent = (game) => {
    if (typeof game.price_info?.discount_percent === 'number') return game.price_info.discount_percent;
    return 0;
  };

  const sortedGames = useMemo(() => {
    const copiedGames = [...games];

    switch (sortOption) {
      case 'name':
        return copiedGames.sort((a, b) =>
          getGameName(a).localeCompare(getGameName(b), 'ko')
        );

      case 'priceLow':
        return copiedGames.sort((a, b) => getGamePrice(a) - getGamePrice(b));

      case 'priceHigh':
        return copiedGames.sort((a, b) => getGamePrice(b) - getGamePrice(a));

      case 'discountHigh':
        return copiedGames.sort((a, b) => getDiscountPercent(b) - getDiscountPercent(a));

      default:
        return copiedGames;
    }
  }, [games, sortOption]);

  if (loading) return <div style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>로딩 중...</div>;
  if (error) return <div style={{ color: '#ff4444', textAlign: 'center', marginTop: '50px' }}>{error}</div>;

  return (
    <div style={{ padding: '40px', color: '#fff', backgroundColor: '#141414', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ borderBottom: '2px solid #E50914', paddingBottom: '10px', margin: 0 }}>
            ❤️ 내 찜/비교 목록
          </h2>
          <span
            style={{
              backgroundColor: '#E50914',
              color: '#fff',
              borderRadius: '999px',
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            총 {games.length}개
          </span>
        </div>

        {games.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#bbb', fontSize: '14px' }}>정렬:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              style={{
                backgroundColor: '#181818',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <option value="name">이름순</option>
              <option value="priceLow">가격 낮은순</option>
              <option value="priceHigh">가격 높은순</option>
              <option value="discountHigh">할인율 높은순</option>
            </select>
          </div>
        )}
      </div>
      
      {sortedGames.length === 0 ? (
        <p style={{ color: '#bbb', textAlign: 'center', marginTop: '50px', fontSize: '18px' }}>
            찜한 게임이 없습니다. 메인 화면에서 하트를 눌러 게임을 추가해보세요.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
          {sortedGames.map(game => (
            <div key={game.slug} style={{ backgroundColor: '#181818', borderRadius: '8px', padding: '15px', border: '1px solid #333', position: 'relative' }}>
              
              <button onClick={() => removeFromWishlist(game.slug)} style={{ position: 'absolute', top: '10px', right: '10px', background: '#E50914', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '5px 10px', zIndex: 10 }}>
                삭제 ✕
              </button>
              
              <img src={game.main_image || game.header_image} alt={game.title} style={{ width: '100%', borderRadius: '4px', marginBottom: '15px' }} onError={(e) => e.target.src = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"} />
              
              <h3 style={{ fontSize: '18px', margin: '0 0 10px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {game.title_ko || game.title}
              </h3>

              {getDiscountPercent(game) > 0 && (
                <p style={{ fontSize: '14px', color: '#E50914', margin: '5px 0', fontWeight: 'bold' }}>
                  🏷 할인율: {getDiscountPercent(game)}%
                </p>
              )}
              
              <p style={{ fontSize: '14px', color: '#bbb', margin: '5px 0' }}>
                🔥 동접자: {game.steam_ccu?.toLocaleString() || 0}명
              </p>
              
              {/* ★ 변경된 부분: 가격 표기를 방금 만든 전역 유틸리티로 통일 */}
              <p style={{ fontSize: '14px', color: '#bbb', margin: '5px 0' }}>
                💰 가격: {formatPrice(game.price_info, region)}
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
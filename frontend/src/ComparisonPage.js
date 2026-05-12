import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from './config';
import { formatPrice } from './utils/priceFormatter';

function ComparisonPage({ region, user }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortOption, setSortOption] = useState('name');

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 480;

  useEffect(() => {
    const fetchWishlistGames = async () => {
      // [수정] 비로그인 상태면 빈 목록 처리
      if (!user) {
        setGames([]);
        setLoading(false);
        return;
      }

      try {
        // [수정] localStorage 대신 DB에서 slug 배열 조회
        const wlRes = await apiClient.get('/user/wishlist');
        const slugs = wlRes.data || [];

        if (slugs.length === 0) {
          setGames([]);
          setLoading(false);
          return;
        }

        const response = await apiClient.post('/recommend/wishlist', { slugs });
        if (response.data.success) {
          setGames(response.data.games || []);
        }
      } catch (err) {
        console.error(err);
        setError('찜 목록 데이터를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchWishlistGames();
  }, [user]);

  const removeFromWishlist = async (slug) => {
    try {
      // [수정] localStorage 대신 DB에서 삭제
      await apiClient.delete(`/user/wishlist/${slug}`);
      setGames(prev => prev.filter(g => g.slug !== slug));
    } catch (err) {
      console.error('찜 삭제 실패:', err);
      alert('삭제 처리 중 오류가 발생했습니다.');
    }
  };

  const getGameName = (game) => {
    return (game.title_ko || game.title || '').toLowerCase();
  };

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

  if (loading) {
    return (
      <div style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>
        로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: '#ff4444', textAlign: 'center', marginTop: '50px' }}>
        {error}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: isMobile ? '20px 12px' : '40px',
        color: '#fff',
        backgroundColor: '#141414',
        minHeight: '100vh',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: '15px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          flexDirection: isMobile ? 'column' : 'row'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2
            style={{
              borderBottom: '2px solid #E50914',
              paddingBottom: '10px',
              margin: 0,
              fontSize: isMobile ? '18px' : '28px'
            }}
          >
            ❤️ 내 찜/비교 목록
          </h2>

          <span
            style={{
              backgroundColor: '#E50914',
              color: '#fff',
              borderRadius: '999px',
              padding: isMobile ? '5px 10px' : '6px 12px',
              fontSize: isMobile ? '13px' : '14px',
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
        <p
          style={{
            color: '#bbb',
            textAlign: 'center',
            marginTop: '50px',
            fontSize: '18px'
          }}
        >
          찜한 게임이 없습니다. 메인 화면에서 하트를 눌러 게임을 추가해보세요.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(2, minmax(0, 1fr))'
              : 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: isMobile ? '12px' : '20px'
          }}
        >
          {sortedGames.map(game => (
            <div
              key={game.slug}
              style={{
                backgroundColor: '#181818',
                borderRadius: '8px',
                padding: isMobile ? '10px' : '15px',
                border: '1px solid #333',
                position: 'relative',
                width: '100%',
                boxSizing: 'border-box',
                minWidth: 0
              }}
            >
              <button
                onClick={() => removeFromWishlist(game.slug)}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: '#E50914',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  padding: isMobile ? '4px 8px' : '5px 10px',
                  zIndex: 10,
                  fontSize: isMobile ? '12px' : '14px'
                }}
              >
                삭제 ✕
              </button>

              <img
                src={game.main_image || game.header_image}
                alt={game.title}
                style={{
                  width: '100%',
                  borderRadius: '4px',
                  marginBottom: '12px',
                  display: 'block'
                }}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/300x169/141414/ffffff?text=No+Image';
                }}
              />

              <h3
                style={{
                  fontSize: isMobile ? '15px' : '18px',
                  margin: '0 0 10px 0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {game.title_ko || game.title}
              </h3>

              {getDiscountPercent(game) > 0 && (
                <p
                  style={{
                    fontSize: isMobile ? '12px' : '14px',
                    color: '#E50914',
                    margin: '5px 0',
                    fontWeight: 'bold'
                  }}
                >
                  🏷 할인율: {getDiscountPercent(game)}%
                </p>
              )}

              <p
                style={{
                  fontSize: isMobile ? '12px' : '14px',
                  color: '#bbb',
                  margin: '5px 0'
                }}
              >
                🔥 동접자: {game.steam_ccu?.toLocaleString() || 0}명
              </p>

              <p
                style={{
                  fontSize: isMobile ? '12px' : '14px',
                  color: '#bbb',
                  margin: '5px 0'
                }}
              >
                💰 가격: {formatPrice(game.price_info, region)}
              </p>

              <Link
                to={`/game/${game.slug || game._id}`}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  backgroundColor: '#333',
                  color: '#fff',
                  textDecoration: 'none',
                  padding: isMobile ? '9px' : '10px',
                  borderRadius: '4px',
                  marginTop: '15px',
                  fontWeight: 'bold',
                  fontSize: isMobile ? '13px' : '14px'
                }}
              >
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
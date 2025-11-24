import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const styles = {
  container: { padding: '40px 20px', minHeight: '100vh', backgroundColor: '#011526', color: '#FFFFFF' },
  titleWrapper: { textAlign: 'center', marginBottom: '30px' },
  title: { fontSize: '2rem', fontWeight: 'bold', color: '#ffffff', borderLeft: '4px solid #E50914', paddingLeft: '12px', display: 'inline-block' },
  tableContainer: { maxWidth: '1200px', margin: '0 auto', overflowX: 'auto', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' },
  table: { width: '100%', borderCollapse: 'collapse', backgroundColor: '#181818', borderRadius: '10px', overflow: 'hidden' },
  th: { padding: '18px', backgroundColor: '#222', color: '#FFFFFF', textAlign: 'left', fontWeight: 'bold', fontSize: '1.1rem', borderBottom: '2px solid #E50914' },
  td: { padding: '20px', borderBottom: '1px solid #333', verticalAlign: 'middle' },
  img: { width: '100px', borderRadius: '6px', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' },
  gameTitle: { fontSize: '1.2rem', fontWeight: 'bold', color: '#FFFFFF', textDecoration: 'none', display: 'block', marginBottom: '5px' },
  price: { color: '#A24CD9', fontWeight: 'bold', fontSize: '1.2rem' },
  discountBadge: { display: 'inline-block', backgroundColor: '#E50914', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem', marginLeft: '8px', fontWeight: 'bold' },
  storeName: { fontSize: '0.9rem', color: '#999', marginTop: '4px' },
  score: { fontWeight: 'bold', color: '#F2B705' },
  playtime: { fontSize: '0.9rem', color: '#5FCDD9', marginTop: '5px' },
  removeBtn: { padding: '8px 16px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' },
  emptyMsg: { textAlign: 'center', marginTop: '100px', fontSize: '1.5rem', color: '#888' },
  homeLink: { display: 'inline-block', marginTop: '20px', color: '#E50914', textDecoration: 'none', fontSize: '1.2rem', fontWeight: 'bold', border: '1px solid #E50914', padding: '10px 20px', borderRadius: '999px' },
  tag: { fontSize: '11px', color: '#ddd', marginRight: '5px', backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '999px' }
};

function ComparisonPage({ region }) {
  const [wishlistGames, setWishlistGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slugs = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    if (slugs.length === 0) { setLoading(false); return; }

    fetch('http://localhost:8000/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs })
    })
    .then(res => res.json())
    .then(data => { setWishlistGames(data); setLoading(false); })
    .catch(err => { console.error(err); setLoading(false); });
  }, []);

  const handleRemove = (slug) => {
    const newSlugs = wishlistGames.filter(g => g.slug !== slug).map(g => g.slug);
    localStorage.setItem('gameWishlist', JSON.stringify(newSlugs));
    setWishlistGames(prev => prev.filter(g => g.slug !== slug));
  };

  const getPriceDisplay = (price) => {
    if (price === null) return "정보 없음";
    if (region === 'US') return `$${(price / 1400).toFixed(2)}`; 
    if (region === 'JP') return `¥${(price / 9).toFixed(0)}`;    
    return `₩${price.toLocaleString()}`; 
  };

  // ★ [수정] padding 단축 속성 대신 paddingTop 등 명시적 사용 (오류 해결)
  if (loading) return <div className="net-panel" style={{textAlign:'center', paddingTop:'100px'}}>로딩 중...</div>;

  if (wishlistGames.length === 0) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>찜한 게임 비교</h2>
        <div style={styles.emptyMsg}>
          <p>찜한 게임이 없습니다.</p>
          <Link to="/" style={styles.homeLink}>게임 구경하러 가기</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.titleWrapper}>
        <h2 style={styles.title}>찜한 게임 비교 ({wishlistGames.length})</h2>
      </div>
      
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>게임</th>
              <th style={styles.th}>가격 / 스토어</th>
              <th style={styles.th}>평가 / 시간</th>
              <th style={styles.th}>출시일</th>
              <th style={{...styles.th, textAlign:'center'}}>관리</th>
            </tr>
          </thead>
          <tbody>
            {wishlistGames.map(game => (
              <tr key={game.slug}>
                <td style={styles.td}>
                  <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                    <img src={game.main_image} alt={game.title} style={styles.img} onError={(e) => e.target.src = "https://via.placeholder.com/120x67?text=No+Image"} />
                    <div>
                        <Link to={`/game/${game.slug}`} style={styles.gameTitle}>{game.title_ko || game.title}</Link>
                        <div style={{marginTop: '8px'}}>
                            {game.smart_tags?.slice(0, 2).map(tag => (
                            <span key={tag} style={styles.tag}>#{tag}</span>
                            ))}
                        </div>
                    </div>
                  </div>
                </td>
                <td style={styles.td}>
                  <div>
                    {game.price_info?.isFree ? (
                      <span style={{color:'#04BFAD', fontWeight:'bold', fontSize:'1.2rem'}}>무료</span>
                    ) : (
                      <>
                        <div>
                          <span style={styles.price}>{getPriceDisplay(game.price_info?.current_price)}</span>
                          {game.price_info?.discount_percent > 0 && (
                            <span style={styles.discountBadge}>-{game.price_info.discount_percent}%</span>
                          )}
                        </div>
                        <div style={styles.storeName}>{game.price_info?.store_name || '정보 없음'}</div>
                      </>
                    )}
                  </div>
                </td>
                <td style={styles.td}>
                  {game.metacritic_score > 0 ? (
                      <div style={styles.score}>M: {game.metacritic_score}점</div>
                  ) : (
                      <div style={{color:'#666', fontSize:'0.9rem'}}>평점 없음</div>
                  )}
                  <div style={styles.playtime}>⏳ {game.play_time}</div>
                </td>
                <td style={styles.td}>
                    <div style={{color:'#ddd', fontSize:'0.9rem'}}>
                        {game.releaseDate ? new Date(game.releaseDate).toLocaleDateString() : '-'}
                    </div>
                </td>
                <td style={{...styles.td, textAlign: 'center'}}>
                  <button style={styles.removeBtn} onClick={() => handleRemove(game.slug)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ComparisonPage;
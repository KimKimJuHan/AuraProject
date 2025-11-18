import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

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
    }).then(r => r.json()).then(data => { setWishlistGames(data); setLoading(false); });
  }, []);

  const handleRemove = (slug) => {
    const newSlugs = wishlistGames.filter(g => g.slug !== slug).map(g => g.slug);
    localStorage.setItem('gameWishlist', JSON.stringify(newSlugs));
    setWishlistGames(prev => prev.filter(g => g.slug !== slug));
  };

  if (loading) return <div className="net-panel" style={{textAlign:'center'}}>로딩 중...</div>;

  return (
    <div className="net-panel">
      <h2 className="net-section-title">찜한 게임 비교</h2>
      {wishlistGames.length === 0 ? (
         <div className="net-empty">찜한 게임이 없습니다. <Link to="/" style={{color:'#E50914'}}>메인으로</Link></div>
      ) : (
        <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', minWidth:'800px'}}>
              <thead>
                <tr style={{borderBottom:'1px solid #333', color:'#999', textAlign:'left'}}>
                  <th style={{padding:'15px'}}>게임</th>
                  <th style={{padding:'15px'}}>가격</th>
                  <th style={{padding:'15px'}}>평점/시간</th>
                  <th style={{padding:'15px'}}>관리</th>
                </tr>
              </thead>
              <tbody>
                {wishlistGames.map(g => (
                  <tr key={g.slug} style={{borderBottom:'1px solid #222'}}>
                    <td style={{padding:'15px', display:'flex', gap:'15px', alignItems:'center'}}>
                        <img src={g.main_image} style={{width:'80px', borderRadius:'4px'}} alt="" />
                        <Link to={`/game/${g.slug}`} style={{color:'#fff', textDecoration:'none', fontWeight:'bold'}}>{g.title_ko || g.title}</Link>
                    </td>
                    <td style={{padding:'15px', color:'#E50914', fontWeight:'bold'}}>
                        {g.price_info?.isFree ? "무료" : (g.price_info?.current_price ? `₩${g.price_info.current_price.toLocaleString()}` : "정보 없음")}
                    </td>
                    <td style={{padding:'15px'}}>
                        <div>M: {g.metacritic_score || '-'}</div>
                        <div style={{color:'#888', fontSize:'13px'}}>⏳ {g.play_time}</div>
                    </td>
                    <td style={{padding:'15px'}}>
                        <button onClick={() => handleRemove(g.slug)} style={{background:'#333', border:'none', color:'#fff', padding:'5px 10px', borderRadius:'4px', cursor:'pointer'}}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      )}
    </div>
  );
}
export default ComparisonPage;
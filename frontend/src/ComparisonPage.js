import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from './config'; // ★ 설정 파일 import

const styles = {
  // ... (기존 스타일 유지, 필요시 PersonalRecoPage.css 등과 통합 고려)
  container: { padding: '40px 5%', color: '#fff', minHeight: '100vh', backgroundColor: '#141414' },
  header: { fontSize: '28px', fontWeight: 'bold', marginBottom: '30px', borderLeft: '5px solid #E50914', paddingLeft: '15px' },
  searchRow: { display: 'flex', gap: '10px', marginBottom: '30px', position: 'relative' },
  searchInput: { flex: 1, padding: '12px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#222', color: '#fff', fontSize: '16px' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#222', border: '1px solid #444', zIndex: 100, maxHeight: '200px', overflowY: 'auto' },
  dropdownItem: { padding: '10px', borderBottom: '1px solid #333', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' },
  card: { backgroundColor: '#181818', borderRadius: '8px', border: '1px solid #333', overflow: 'hidden', position: 'relative' },
  cardHeader: { padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: 'bold', fontSize: '16px' },
  removeBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' },
  cardBody: { padding: '15px' },
  row: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' },
  label: { color: '#888' },
  val: { fontWeight: 'bold' },
  scoreBar: { height: '6px', backgroundColor: '#333', borderRadius: '3px', marginTop: '5px', overflow: 'hidden' },
  emptyMsg: { textAlign: 'center', color: '#666', marginTop: '50px', fontSize: '18px' }
};

function ComparisonPage({ region, user }) {
  const [wishlistSlugs, setWishlistSlugs] = useState([]);
  const [games, setGames] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  // 1. 로컬 스토리지에서 찜 목록 로드
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    setWishlistSlugs(stored);
  }, []);

  // 2. 찜 목록 게임 데이터 가져오기
  useEffect(() => {
    if (wishlistSlugs.length === 0) {
        setGames([]);
        return;
    }
    const fetchGames = async () => {
        try {
            // ★ API 주소 변수 사용
            const res = await fetch(`${API_BASE_URL}/api/wishlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slugs: wishlistSlugs })
            });
            const data = await res.json();
            setGames(data);
        } catch (e) { console.error(e); }
    };
    fetchGames();
  }, [wishlistSlugs]);

  // 3. 검색어 자동완성
  useEffect(() => {
    if (searchTerm.length < 1) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
        try {
            // ★ API 주소 변수 사용
            const res = await fetch(`${API_BASE_URL}/api/search/autocomplete?q=${searchTerm}`);
            const data = await res.json();
            setSuggestions(data);
        } catch(e){}
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const addGame = (game) => {
      if (!wishlistSlugs.includes(game.slug)) {
          const newSlugs = [...wishlistSlugs, game.slug];
          setWishlistSlugs(newSlugs);
          localStorage.setItem('gameWishlist', JSON.stringify(newSlugs));
      }
      setSearchTerm("");
      setSuggestions([]);
  };

  const removeGame = (slug) => {
      const newSlugs = wishlistSlugs.filter(s => s !== slug);
      setWishlistSlugs(newSlugs);
      localStorage.setItem('gameWishlist', JSON.stringify(newSlugs));
  };

  const getPrice = (g) => {
      if (g.price_info?.isFree) return "무료";
      return g.price_info?.current_price ? `₩${g.price_info.current_price.toLocaleString()}` : "정보 없음";
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>⚖️ 게임 비교함</h1>
      
      <div style={styles.searchRow}>
          <input 
            style={styles.searchInput} 
            placeholder="비교할 게임을 검색해서 추가하세요..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
          {suggestions.length > 0 && (
              <div style={styles.dropdown}>
                  {suggestions.map((s, i) => (
                      <div key={i} style={styles.dropdownItem} onClick={() => addGame(s)}>
                          <span>{s.title}</span>
                          <span style={{fontSize:'12px', color:'#888'}}>{s.title_ko}</span>
                      </div>
                  ))}
              </div>
          )}
      </div>

      {games.length === 0 ? (
          <div style={styles.emptyMsg}>비교할 게임이 없습니다. 검색해서 추가해보세요!</div>
      ) : (
          <div style={styles.grid}>
              {games.map(g => (
                  <div key={g._id} style={styles.card}>
                      <img src={g.main_image} alt="" style={{width:'100%', height:'150px', objectFit:'cover'}} />
                      <div style={styles.cardHeader}>
                          <Link to={`/game/${g.slug}`} style={{...styles.cardTitle, color:'#fff', textDecoration:'none'}}>
                              {g.title_ko || g.title}
                          </Link>
                          <button style={styles.removeBtn} onClick={() => removeGame(g.slug)}>✕</button>
                      </div>
                      <div style={styles.cardBody}>
                          <div style={styles.row}><span style={styles.label}>가격</span> <span style={{...styles.val, color:'#46d369'}}>{getPrice(g)}</span></div>
                          <div style={styles.row}><span style={styles.label}>메타스코어</span> <span style={styles.val}>{g.metacritic_score || '-'}</span></div>
                          <div style={styles.row}><span style={styles.label}>플레이타임</span> <span style={styles.val}>{g.play_time}</span></div>
                          <div style={styles.row}><span style={styles.label}>출시일</span> <span style={styles.val}>{g.releaseDate ? g.releaseDate.substring(0,10) : '-'}</span></div>
                          
                          <div style={{marginTop:'15px'}}>
                              <span style={styles.label}>트렌드 점수</span>
                              <div style={styles.scoreBar}>
                                  <div style={{width: `${Math.min(g.trend_score / 20, 100)}%`, height:'100%', backgroundColor:'#E50914'}}></div>
                              </div>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
}

export default ComparisonPage;
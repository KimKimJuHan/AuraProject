import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';

import MainPage from './MainPage';
import ShopPage from './ShopPage';
import ComparisonPage from './ComparisonPage';
import SearchResultsPage from './SearchResultsPage'; // ★ 이거 import 되어 있는지 확인!

const styles = {
  navBar: { width: '100%', backgroundColor: '#021E73', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box', boxShadow: '0 2px 8px rgba(0,0,0,0.6)' },
  homeLink: { color: '#D494D9', textDecoration: 'none', fontSize: '20px', fontWeight: 'bold', minWidth: '120px', letterSpacing: '0.5px' },
  searchContainer: { position: 'relative', width: '100%', maxWidth: '500px' },
  searchInput: { width: '100%', padding: '10px 40px 10px 15px', fontSize: '16px', borderRadius: '999px', border: '1px solid #3D46F2', backgroundColor: '#011526', color: '#FFFFFF', outline: 'none', boxShadow: '0 0 0 1px rgba(61,70,242,0.3)' },
  clearButton: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#D494D9', fontSize: '20px', cursor: 'pointer' },
  suggestionsList: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#021E73', border: '1px solid #3D46F2', borderRadius: '0 0 10px 10px', listStyle: 'none', padding: 0, margin: 4, marginTop: 6, zIndex: 1000, boxShadow: '0 10px 25px rgba(0,0,0,0.7)' },
  suggestionItem: { padding: '10px 15px', cursor: 'pointer', color: '#FFFFFF' },
  suggestionItemSelected: { padding: '10px 15px', cursor: 'pointer', color: '#FFFFFF', backgroundColor: '#3D46F2', fontWeight: 'bold' },
  suggestionItemHistory: { padding: '10px 15px', cursor: 'pointer', color: '#D494D9', fontStyle: 'italic' },
  clearHistoryButton: { padding: '10px 15px', cursor: 'pointer', color: '#D94F4C', fontStyle: 'italic', textAlign: 'center', backgroundColor: '#011526' },
  
  rightGroup: { display: 'flex', alignItems: 'center', gap: '15px' }, 
  compareLink: { color: '#A24CD9', textDecoration: 'none', fontSize: '16px', fontWeight: 'bold', border: '1px solid #A24CD9', padding: '5px 10px', borderRadius: '999px' },
  
  regionSelect: {
    backgroundColor: '#011526',
    color: '#FFFFFF',
    border: '1px solid #3D46F2',
    borderRadius: '5px',
    padding: '5px 10px',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none'
  },
  navSpacer: { minWidth: '120px' }
};

function NavigationBar({ region, setRegion }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]); 
  const [history, setHistory] = useState([]); 
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate(); 
  const debounceTimer = useRef(null); 
  const searchContainerRef = useRef(null); 

  useEffect(() => {
    const storedHistory = localStorage.getItem('gameSearchHistory');
    if (storedHistory) setHistory(JSON.parse(storedHistory));
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) setIsFocused(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchContainerRef]);

  const fetchSuggestions = async (query) => {
    if (query.length < 2) { setSuggestions([]); return; }
    try {
      const response = await fetch(`http://localhost:8000/api/search/autocomplete?q=${query}`);
      const data = await response.json();
      setSuggestions(data);
      setSelectedIndex(-1); 
    } catch (err) { console.error(err); }
  };

  const handleInputChange = (e) => {
    const query = e.target.value;
    setSearchTerm(query);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { fetchSuggestions(query); }, 300);
  };

  const handleKeyDown = (e) => {
    const list = searchTerm.length > 1 ? suggestions : history;
    if (!list || list.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev < list.length - 1 ? prev + 1 : prev)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1)); }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0) {
            const selectedItem = list[selectedIndex];
            if (selectedItem.slug) handleSuggestionClick(selectedItem);
            else { setSearchTerm(selectedItem); fetchSuggestions(selectedItem); }
        } else { handleSubmit(e); }
    }
  };

  // ★ [수정] 검색 로직 대폭 개선
  const handleSubmit = async (e) => {
    if(e) e.preventDefault(); 
    const query = searchTerm.trim();
    if (!query) return;

    const newHistory = [query, ...history.filter(h => h !== query).slice(0, 4)];
    setHistory(newHistory);
    localStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    
    // 1. 현재 자동완성 목록에서 정확히 일치하는 게 있는지 확인
    let targetGame = suggestions.find(g => g.title.toLowerCase() === query.toLowerCase());

    // 2. 없으면 API에 한 번 더 물어봄 (혹시 목록에 없는데 정확한 게임이 있는지)
    if (!targetGame) {
        try {
            const response = await fetch(`http://localhost:8000/api/search/autocomplete?q=${query}`);
            const data = await response.json();
            // 정확히 일치하는게 있으면 그걸로 설정
            targetGame = data.find(g => g.title.toLowerCase() === query.toLowerCase());
        } catch (err) { console.error(err); }
    }

    if (targetGame) {
      // A. 정확한 게임을 찾았다면 -> 상세 페이지로 바로 이동
      setSearchTerm(targetGame.title); 
      setIsFocused(false); 
      setSuggestions([]); 
      navigate(`/game/${targetGame.slug}`);
    } else {
      // B. 정확한 게임이 없다면 -> '검색 결과 페이지'로 이동 (alert 제거)
      // "po", "potal" 등을 검색하면 여기로 와서 리스트를 보여줌
      setIsFocused(false);
      setSuggestions([]);
      navigate(`/search?q=${query}`);
    }
  };

  const handleSuggestionClick = (game) => {
    setSearchTerm(game.title); setIsFocused(false);
    const newHistory = [game.title, ...history.filter(h => h !== game.title).slice(0, 4)];
    setHistory(newHistory);
    localStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    navigate(`/game/${game.slug}`); 
  };
  
  const handleClearHistory = () => { setHistory([]); localStorage.removeItem('gameSearchHistory'); setIsFocused(false); };
  const handleClear = () => { setSearchTerm(""); setSuggestions([]); setSelectedIndex(-1); setIsFocused(true); };

  const showDropdown = isFocused && (searchTerm.length > 0 || history.length > 0);
  const dropdownContent = searchTerm.length > 1 ? suggestions : history;

  return (
    <nav style={styles.navBar}>
      <Link to="/" style={styles.homeLink}>GameReco</Link>
      
      <div style={styles.searchContainer} ref={searchContainerRef}>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="게임 검색..." style={styles.searchInput} value={searchTerm} onChange={handleInputChange} onKeyDown={handleKeyDown} onFocus={() => setIsFocused(true)} />
        </form>
        {searchTerm.length > 0 && <button onClick={handleClear} style={styles.clearButton}>×</button>}
        
        {showDropdown && (
          <ul style={styles.suggestionsList}>
            {dropdownContent.length > 0 ? (
              dropdownContent.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <li key={item.slug || `${item}-${index}`} style={isSelected ? styles.suggestionItemSelected : (searchTerm.length > 1 ? styles.suggestionItem : styles.suggestionItemHistory)} onMouseEnter={() => setSelectedIndex(index)} onMouseDown={() => { if (item.slug) handleSuggestionClick(item); else { setSearchTerm(item); fetchSuggestions(item); } }}>
                    {item.title || item}
                  </li>
                );
              })
            ) : ( searchTerm.length > 1 && <li style={styles.suggestionItemHistory}>검색 결과 없음</li> )}
            {searchTerm.length <= 1 && history.length > 0 && <li style={styles.clearHistoryButton} onMouseDown={handleClearHistory}>검색 기록 모두 지우기</li>}
            {searchTerm.length <= 1 && history.length === 0 && <li style={styles.suggestionItemHistory}>검색 기록 없음</li>}
          </ul>
        )}
      </div>

      <div style={styles.rightGroup}>
          <select style={styles.regionSelect} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="KR">🇰🇷 KRW</option>
            <option value="US">🇺🇸 USD</option>
            <option value="JP">🇯🇵 JPY</option>
          </select>
          <Link to="/comparison" style={styles.compareLink}>❤️ 찜/비교</Link>
      </div>
    </nav>
  );
}

function App() {
  const [region, setRegion] = useState(localStorage.getItem('userRegion') || 'KR');

  useEffect(() => {
    localStorage.setItem('userRegion', region);
  }, [region]);

  return (
    <Router>
      <div>
        <NavigationBar region={region} setRegion={setRegion} />
        <Routes>
          <Route path="/" element={<MainPage region={region} />} />
          <Route path="/game/:id" element={<ShopPage region={region} />} />
          <Route path="/comparison" element={<ComparisonPage region={region} />} />
          {/* ★ 검색 결과 페이지 라우트가 꼭 있어야 함! */}
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </div>
    </Router>
  );
}
export default App;
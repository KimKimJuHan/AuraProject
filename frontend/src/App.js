import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';

import MainPage from './MainPage';
import ShopPage from './ShopPage';
import ComparisonPage from './ComparisonPage';
import SearchResultsPage from './SearchResultsPage';

const styles = {
  navBar: { width: '100%', backgroundColor: '#000000', padding: '15px 4%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box', borderBottom: '1px solid #333', position:'sticky', top:0, zIndex:1000 },
  searchContainer: { position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' },
  clearButton: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#999', fontSize: '18px', cursor: 'pointer' },
  suggestionsList: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#141414', border: '1px solid #333', listStyle: 'none', padding: 0, margin: 0, zIndex: 1000, marginTop:'5px' },
  suggestionItem: { padding: '10px 15px', cursor: 'pointer', color: '#fff', borderBottom: '1px solid #222' },
  suggestionItemSelected: { padding: '10px 15px', cursor: 'pointer', color: '#fff', backgroundColor: '#333', fontWeight: 'bold', borderBottom: '1px solid #222' },
  clearHistoryButton: { padding: '10px', cursor: 'pointer', color: '#E50914', textAlign: 'center', fontSize: '13px' },
  
  rightGroup: { display: 'flex', alignItems: 'center', gap: '15px' },
  compareLink: { color: '#fff', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold', display:'flex', alignItems:'center', gap:'5px' },
  regionSelect: { backgroundColor: '#000', color: '#fff', border: '1px solid #fff', padding: '5px', borderRadius: '4px', fontSize: '13px' }
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
    if (query.length < 1) { setSuggestions([]); return; }
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
    const list = searchTerm.length > 0 ? suggestions : history;
    if (!list || list.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev < list.length - 1 ? prev + 1 : prev)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1)); }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0) {
            const item = list[selectedIndex];
            if (item.slug) handleSuggestionClick(item);
            else { setSearchTerm(item); fetchSuggestions(item); }
        } else { handleSubmit(e); }
    }
  };

  const handleSubmit = async (e) => {
    if(e) e.preventDefault(); 
    const query = searchTerm.trim();
    if (!query) return;
    const newHistory = [query, ...history.filter(h => h !== query).slice(0, 4)];
    setHistory(newHistory);
    localStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    
    let targetGame = suggestions.find(g => g.title.toLowerCase() === query.toLowerCase());
    if (!targetGame) {
        try {
            const response = await fetch(`http://localhost:8000/api/search/autocomplete?q=${query}`);
            const data = await response.json();
            if (data.length > 0) targetGame = data[0]; 
        } catch (err) { console.error(err); }
    }
    if (targetGame) {
      setSearchTerm(targetGame.title); setIsFocused(false); setSuggestions([]); navigate(`/game/${targetGame.slug}`);
    } else {
      setIsFocused(false); setSuggestions([]); navigate(`/search?q=${query}`);
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

  return (
    <header className="net-header">
      <Link to="/" className="net-logo">PLAY FOR YOU</Link>

      <div style={styles.searchContainer} ref={searchContainerRef}>
        <form onSubmit={handleSubmit}>
            <input 
                type="text" 
                className="net-search-input"
                placeholder="게임 검색..."
                value={searchTerm}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
            />
        </form>
        {searchTerm.length > 0 && <button onClick={handleClear} style={styles.clearButton}>✕</button>}
        
        {isFocused && (searchTerm.length > 0 || history.length > 0) && (
            <ul style={styles.suggestionsList}>
                {(searchTerm.length > 0 ? suggestions : history).map((item, idx) => (
                    <li key={idx} style={idx === selectedIndex ? styles.suggestionItemSelected : styles.suggestionItem}
                    onMouseDown={() => {
                        if(item.slug) handleSuggestionClick(item);
                        else { setSearchTerm(item); fetchSuggestions(item); }
                    }}>
                        {item.slug ? (
                            <div style={{display:'flex', justifyContent:'space-between'}}>
                                <span>{item.title}</span>
                                {item.title_ko && <span style={{color:'#888', fontSize:'12px', marginLeft:'10px'}}>{item.title_ko}</span>}
                            </div>
                        ) : item}
                    </li>
                ))}
                {searchTerm.length === 0 && history.length > 0 && (
                    <li style={styles.clearHistoryButton} onMouseDown={handleClearHistory}>기록 삭제</li>
                )}
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
    </header>
  );
}

function App() {
  const [region, setRegion] = useState(localStorage.getItem('userRegion') || 'KR');
  useEffect(() => { localStorage.setItem('userRegion', region); }, [region]);

  return (
    <Router>
      <div className="app net-app">
        <NavigationBar region={region} setRegion={setRegion} />
        <Routes>
          <Route path="/" element={<MainPage region={region} />} />
          <Route path="/game/:id" element={<ShopPage region={region} />} />
          <Route path="/comparison" element={<ComparisonPage region={region} />} />
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </div>
    </Router>
  );
}
export default App;
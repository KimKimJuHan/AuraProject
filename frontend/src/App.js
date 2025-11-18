// /frontend/src/App.js

import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';

import MainPage from './MainPage';
import ShopPage from './ShopPage';
import ComparisonPage from './ComparisonPage';

// --- 스타일 객체 ---
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
  compareLink: { color: '#A24CD9', textDecoration: 'none', fontSize: '16px', fontWeight: 'bold', minWidth: '120px', textAlign: 'right', border: '1px solid #A24CD9', padding: '5px 10px', borderRadius: '999px' },
  navSpacer: { minWidth: '120px' } // 모바일 반응형 등을 위한 여백용 (비교 링크 없을때)
};

function NavigationBar() {
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
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchContainerRef]);

  const fetchSuggestions = async (query) => {
    if (query.length < 2) { 
      setSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`http://localhost:8000/api/search/autocomplete?q=${query}`);
      const data = await response.json();
      setSuggestions(data);
      setSelectedIndex(-1); 
    } catch (err) {
      console.error("자동완성 API 호출 실패:", err);
    }
  };

  const handleInputChange = (e) => {
    const query = e.target.value;
    setSearchTerm(query);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);
  };

  const handleKeyDown = (e) => {
    const list = searchTerm.length > 1 ? suggestions : history;
    if (!list || list.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < list.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0) {
            const selectedItem = list[selectedIndex];
            if (selectedItem.slug) handleSuggestionClick(selectedItem);
            else { setSearchTerm(selectedItem); fetchSuggestions(selectedItem); }
        } else {
            handleSubmit(e);
        }
    }
  };

  const handleSubmit = async (e) => {
    if(e) e.preventDefault(); 
    const query = searchTerm.trim();
    if (!query) return;

    const newHistory = [query, ...history.filter(h => h !== query).slice(0, 4)];
    setHistory(newHistory);
    localStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    
    let targetGame = suggestions.find(g => g.title.toLowerCase().includes(query.toLowerCase()));

    if (!targetGame) {
        try {
            const response = await fetch(`http://localhost:8000/api/search/autocomplete?q=${query}`);
            const data = await response.json();
            if (data.length > 0) targetGame = data[0]; 
        } catch (err) {
            console.error(err);
        }
    }

    if (targetGame) {
      setSearchTerm(targetGame.title); 
      setIsFocused(false);
      setSuggestions([]); 
      navigate(`/game/${targetGame.slug}`);
    } else {
      alert(`'${query}'에 대한 게임을 찾을 수 없습니다.`);
      setIsFocused(false);
    }
  };

  const handleSuggestionClick = (game) => {
    setSearchTerm(game.title); 
    setIsFocused(false);
    const newHistory = [game.title, ...history.filter(h => h !== game.title).slice(0, 4)];
    setHistory(newHistory);
    localStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    navigate(`/game/${game.slug}`); 
  };
  
  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('gameSearchHistory');
    setIsFocused(false);
  };

  const handleClear = () => {
    setSearchTerm("");
    setSuggestions([]);
    setSelectedIndex(-1);
    setIsFocused(true); 
  };

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
              dropdownContent.map((item, index) => (
                <li key={item.slug || `${item}-${index}`} style={index === selectedIndex ? styles.suggestionItemSelected : (searchTerm.length > 1 ? styles.suggestionItem : styles.suggestionItemHistory)} onMouseEnter={() => setSelectedIndex(index)} onMouseDown={() => { if (item.slug) handleSuggestionClick(item); else { setSearchTerm(item); fetchSuggestions(item); } }}>
                  {item.title || item}
                </li>
              ))
            ) : ( 
              searchTerm.length > 1 && <li style={styles.suggestionItemHistory}>검색 결과 없음</li>
            )}
            {searchTerm.length <= 1 && history.length > 0 && <li style={styles.clearHistoryButton} onMouseDown={handleClearHistory}>검색 기록 모두 지우기</li>}
            {searchTerm.length <= 1 && history.length === 0 && <li style={styles.suggestionItemHistory}>검색 기록 없음</li>}
          </ul>
        )}
      </div>
      <Link to="/comparison" style={styles.compareLink}>❤️ 찜/비교</Link>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div>
        <NavigationBar />
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/game/:id" element={<ShopPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
        </Routes>
      </div>
    </Router>
  );
}
export default App;
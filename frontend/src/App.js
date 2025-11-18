import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';

import MainPage from './MainPage';
import ShopPage from './ShopPage';
import ComparisonPage from './ComparisonPage';
import SearchResultsPage from './SearchResultsPage';

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
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsFocused(false);
      }
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

  // 1. 키보드 조작 핸들러 (여기서는 선택된 항목으로 바로 이동)
  const handleKeyDown = (e) => {
    const list = searchTerm.length > 0 ? suggestions : history;
    if (!list || list.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < list.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
        e.preventDefault();
        // ★ 키보드로 특정 항목을 '선택'하고 엔터를 친 경우 -> 바로 이동
        if (selectedIndex >= 0) {
            const selectedItem = list[selectedIndex];
            if (selectedItem.slug) handleSuggestionClick(selectedItem); // 게임이면 상세페이지
            else { setSearchTerm(selectedItem); fetchSuggestions(selectedItem); } // 검색어면 자동완성
        } else {
            // ★ 선택 없이 그냥 엔터 친 경우 -> handleSubmit으로 넘김
            handleSubmit(e);
        }
    }
  };

  // 2. 검색 제출 (엔터) 핸들러 - 로직 수정됨
  const handleSubmit = (e) => {
    if(e) e.preventDefault(); 
    const query = searchTerm.trim();
    if (!query) return;

    const newHistory = [query, ...history.filter(h => h !== query).slice(0, 4)];
    setHistory(newHistory);
    localStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    
    // ★ [수정] "정확히 일치"하는 게임이 있는지 확인
    // (대소문자 무시하고 제목이 완전히 같아야 함)
    const exactMatch = suggestions.find(
        g => g.title.toLowerCase() === query.toLowerCase() || 
             g.title_ko?.toLowerCase() === query.toLowerCase()
    );

    setIsFocused(false);
    setSuggestions([]);

    if (exactMatch) {
        // 1. 정확히 일치하는 게임이 있으면 -> 상세 페이지로 이동
        setSearchTerm(exactMatch.title_ko || exactMatch.title);
        navigate(`/game/${exactMatch.slug}`);
    } else {
        // 2. 일치하는 게 없거나(부분 일치 포함) 그냥 검색어를 입력함 -> 검색 결과 페이지로 이동
        navigate(`/search?q=${query}`);
    }
  };

  const handleSuggestionClick = (game) => {
    setSearchTerm(game.title_ko || game.title); 
    setIsFocused(false);
    const newHistory = [game.title_ko || game.title, ...history.filter(h => h !== (game.title_ko || game.title)).slice(0, 4)];
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
                    <li key={idx} style={{
                        padding:'10px 15px', cursor:'pointer', color:'#fff',
                        backgroundColor: idx === selectedIndex ? '#333' : 'transparent',
                        borderBottom: '1px solid #222'
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)} // 마우스 호버 시 선택 인덱스 변경
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
                    <li 
                        style={{padding:'10px', textAlign:'center', color:'#e50914', cursor:'pointer', fontSize:'13px'}}
                        onMouseDown={handleClearHistory}
                    >
                        기록 삭제
                    </li>
                )}
            </ul>
        )}
      </div>

      <div style={styles.rightGroup}>
          <select 
            style={styles.regionSelect} 
            value={region} 
            onChange={(e) => setRegion(e.target.value)}
          >
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

  useEffect(() => {
    localStorage.setItem('userRegion', region);
  }, [region]);

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
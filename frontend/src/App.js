// /frontend/src/App.js

import React, { useState, useEffect, useRef } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useNavigate 
} from 'react-router-dom';

import MainPage from './MainPage';
import ShopPage from './ShopPage';

// --- 스타일 객체 (검색바용) ---
const styles = {
  navBar: {
    width: '100%', 
    backgroundColor: '#027373', 
    padding: '12px 20px', 
    display: 'flex', 
    justifyContent: 'space-between', // Home | Search | Spacer
    alignItems: 'center',
    boxSizing: 'border-box'
  },
  homeLink: {
    color: 'white',
    textDecoration: 'none',
    fontSize: '18px',
    fontWeight: 'bold',
    minWidth: '120px', // (spacer와 너비 맞추기)
  },
  searchContainer: {
    position: 'relative', 
    width: '100%', // (중간 영역을 다 차지)
    maxWidth: '500px',
  },
  searchInput: {
    width: '100%',
    padding: '10px 40px 10px 15px', 
    fontSize: '16px',
    borderRadius: '5px',
    border: 'none',
    backgroundColor: '#172026', 
    color: 'white',
  },
  clearButton: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '20px',
    cursor: 'pointer',
  },
  suggestionsList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#027373', 
    border: '1px solid #5FCDD9',
    borderRadius: '0 0 5px 5px',
    listStyle: 'none',
    padding: 0,
    margin: 0,
    zIndex: 1000,
  },
  suggestionItem: {
    padding: '10px 15px',
    cursor: 'pointer',
    color: 'white',
  },
  suggestionItemHistory: {
    padding: '10px 15px',
    cursor: 'pointer',
    color: '#aaa', 
    fontStyle: 'italic',
  },
  navSpacer: {
    minWidth: '120px', 
  }
};
// --- [스타일 끝] ---

// '상단바' 컴포넌트
function NavigationBar() {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]); 
  const [history, setHistory] = useState([]); 
  const [isFocused, setIsFocused] = useState(false);
  
  const navigate = useNavigate(); 
  const debounceTimer = useRef(null); 
  const searchContainerRef = useRef(null); 

  useEffect(() => {
    const storedHistory = localStorage.getItem('gameSearchHistory');
    if (storedHistory) {
      setHistory(JSON.parse(storedHistory));
    }
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
    } catch (err) {
      console.error("자동완성 API 호출 실패:", err);
    }
  };

  const handleInputChange = (e) => {
    const query = e.target.value;
    setSearchTerm(query);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);
  };

  const handleSubmit = (e) => {
    e.preventDefault(); 
    if (!searchTerm.trim()) return;

    const newHistory = [searchTerm, ...history.filter(h => h !== searchTerm).slice(0, 4)];
    setHistory(newHistory);
    localStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    
    setIsFocused(false);
    alert(`검색: ${searchTerm} (페이지 이동 구현 필요)`);
  };

  const handleSuggestionClick = (game) => {
    setSearchTerm(game.title); 
    setIsFocused(false);
    navigate(`/game/${game.slug}`); 
  };
  
  const handleClear = () => {
    setSearchTerm("");
    setSuggestions([]);
    setIsFocused(true); 
  };

  const showDropdown = isFocused && (searchTerm.length > 0 || history.length > 0);
  const dropdownContent = searchTerm.length > 1 ? suggestions : history;

  return (
    <nav style={styles.navBar}>
      <Link to="/" style={styles.homeLink}>
        Home (메인)
      </Link>
      <div style={styles.searchContainer} ref={searchContainerRef}>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="검색..."
            style={styles.searchInput}
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
          />
        </form>
        {searchTerm.length > 0 && (
          <button onClick={handleClear} style={styles.clearButton}>×</button>
        )}
        {showDropdown && (
          <ul style={styles.suggestionsList}>
            {dropdownContent.length > 0 ? (
              dropdownContent.map((item, index) => (
                <li 
                  key={item.slug || `${item}-${index}`} 
                  style={searchTerm.length > 1 ? styles.suggestionItem : styles.suggestionItemHistory}
                  onMouseDown={() => {
                    if (item.slug) {
                      handleSuggestionClick(item)
                    } else {
                      setSearchTerm(item);
                      fetchSuggestions(item);
                    }
                  }}
                >
                  {item.title || item}
                </li>
              ))
            ) : ( 
              searchTerm.length > 1 && 
              <li style={styles.suggestionItemHistory}>'{searchTerm}' 검색 결과가 없습니다.</li>
            )}
            {searchTerm.length <= 1 && history.length === 0 &&
              <li style={styles.suggestionItemHistory}>검색 기록이 없습니다.</li>
            }
          </ul>
        )}
      </div>
      <div style={styles.navSpacer}></div>
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
        </Routes>
      </div>
    </Router>
  );
}

export default App;
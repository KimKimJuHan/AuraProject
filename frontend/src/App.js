import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import { API_BASE_URL, apiClient } from './config';
import { safeLocalStorage } from './utils/storage';

import MainPage from './MainPage';
import ShopPage from './ShopPage';
import ComparisonPage from './ComparisonPage';
import SearchResultsPage from './SearchResultsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage'; 
import PersonalRecoPage from './pages/PersonalRecoPage';
import MyPage from './pages/MyPage'; // ★ 마이페이지 임포트 추가

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
  regionSelect: { backgroundColor: '#000', color: '#fff', border: '1px solid #555', padding: '5px', borderRadius: '4px', fontSize: '13px' },
  authBtn: { backgroundColor: '#E50914', color: '#fff', border: 'none', padding: '7px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'none', fontSize: '14px' },
  userText: { color: '#fff', fontSize: '14px', fontWeight: 'bold' },
  recoBtn: { color: '#E50914', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold', border: '1px solid #E50914', padding: '6px 12px', borderRadius: '4px' }
};

function NavigationBar({ user, setUser, region, setRegion }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]); 
  const [history, setHistory] = useState([]); 
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const navigate = useNavigate(); 
  const debounceTimer = useRef(null); 
  const searchContainerRef = useRef(null); 

  useEffect(() => {
    const storedHistory = safeLocalStorage.getItem('gameSearchHistory');
    if (storedHistory) {
        try { setHistory(JSON.parse(storedHistory)); } catch(e) {}
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
    if (query.length < 1) { setSuggestions([]); return; }
    try {
      const response = await apiClient.get(`/search/autocomplete?q=${query}`);
      setSuggestions(response.data);
      setSelectedIndex(-1); 
    } catch (err) { console.error(err); }
  };

  const handleInputChange = (e) => {
    const query = e.target.value;
    setSearchTerm(query);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { fetchSuggestions(query); }, 300);
  };

  const handleSuggestionClick = (game) => {
    setSearchTerm(game.title); 
    setIsFocused(false);
    const newHistory = [game.title, ...history.filter(h => h !== game.title).slice(0, 4)];
    setHistory(newHistory);
    safeLocalStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    navigate(`/game/${game.slug}`); 
  };

  const handleSubmit = (e) => {
    if(e) e.preventDefault(); 
    const query = searchTerm.trim();
    if (!query) return;
    const newHistory = [query, ...history.filter(h => h !== query).slice(0, 4)];
    setHistory(newHistory);
    safeLocalStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
    const targetGame = suggestions.find(g => g.title.toLowerCase() === query.toLowerCase());
    setIsFocused(false); 
    setSuggestions([]); 
    if (targetGame) {
      setSearchTerm(targetGame.title); 
      navigate(`/game/${targetGame.slug}`);
    } else {
      navigate(`/search?q=${query}`);
    }
  };

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
        if (selectedIndex >= 0) {
            const item = list[selectedIndex];
            if (item.slug) handleSuggestionClick(item);
            else { 
                setSearchTerm(item); 
                navigate(`/search?q=${item}`);
                setIsFocused(false);
            }
        } else { handleSubmit(e); }
    }
  };
  
  const handleClearHistory = () => {
    setHistory([]);
    safeLocalStorage.removeItem('gameSearchHistory');
    setIsFocused(false);
    navigate('/search');
  };

  const handleClear = () => {
    setSearchTerm("");
    setSuggestions([]);
    setSelectedIndex(-1);
    setIsFocused(true); 
  };

  const handleLogout = async () => {
    try {
        await apiClient.post('/auth/logout');
        setUser(null);
        alert("성공적으로 로그아웃 되었습니다.");
        navigate('/');
    } catch (error) {
        console.error("로그아웃 실패", error);
    }
  };

  return (
    <header className="net-header">
      <Link to="/" className="net-logo">PLAY FOR YOU</Link>

      <div style={styles.searchContainer} ref={searchContainerRef}>
        <form onSubmit={handleSubmit}>
            <input type="text" className="net-search-input" placeholder="게임 검색..." value={searchTerm} onChange={handleInputChange} onKeyDown={handleKeyDown} onFocus={() => setIsFocused(true)} />
        </form>
        {searchTerm.length > 0 && <button onClick={handleClear} style={styles.clearButton}>✕</button>}
        
        {isFocused && (
            <ul style={styles.suggestionsList}>
                {(searchTerm.length > 0 ? suggestions : history).map((item, idx) => (
                    <li key={idx} style={idx === selectedIndex ? styles.suggestionItemSelected : styles.suggestionItem}
                    onMouseDown={() => { 
                        if(item.slug) handleSuggestionClick(item); 
                        else { 
                            setSearchTerm(item); 
                            navigate(`/search?q=${item}`);
                            setIsFocused(false);
                        } 
                    }}>
                        {item.slug ? (
                            <div style={{display:'flex', justifyContent:'space-between'}}>
                                <span>{item.title}</span>
                                {item.title_ko && <span style={{color:'#888', fontSize:'12px', marginLeft:'10px'}}>{item.title_ko}</span>}
                            </div>
                        ) : item}
                    </li>
                ))}
                {searchTerm.length === 0 && history.length > 0 && ( <li style={styles.clearHistoryButton} onMouseDown={handleClearHistory}>기록 삭제</li> )}
            </ul>
        )}
      </div>

      <div style={styles.rightGroup}>
          <Link to="/recommend/personal" style={styles.recoBtn}>🤖 게임 추천</Link>
          
          <select style={styles.regionSelect} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="KR">🇰🇷 KRW</option>
            <option value="US">🇺🇸 USD</option>
            <option value="JP">🇯🇵 JPY</option>
          </select>
          <Link to="/comparison" style={styles.compareLink}>❤️ 찜/비교</Link>
          
          {user ? (
            <>
                {/* ★ 마이페이지 링크 추가 */}
                <Link to="/mypage" style={styles.compareLink}>👤 마이페이지</Link>
                <span style={styles.userText}>{user.displayName || user.username}님</span>
                {user.avatar && <img src={user.avatar} alt="profile" style={{width:'32px', height:'32px', borderRadius:'50%'}} />}
                <button onClick={handleLogout} style={{...styles.authBtn, backgroundColor: '#333'}}>로그아웃</button>
            </>
          ) : (
            <Link to="/login" style={styles.authBtn}>로그인</Link>
          )}
      </div>
    </header>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [region, setRegion] = useState('KR');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
        try {
            const response = await apiClient.get('/auth/status');
            if (response.data.isAuthenticated) {
                setUser(response.data.user);
            } else {
                setUser(null);
            }
        } catch (error) {
            console.error('인증 상태 확인 실패:', error);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };
    checkAuthStatus();
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white', backgroundColor: '#121212' }}>Loading AuraProject...</div>;
  }

  return (
    <Router>
      <div className="net-app">
        <NavigationBar user={user} setUser={setUser} region={region} setRegion={setRegion} />
        <Routes>
          <Route path="/" element={<MainPage region={region} user={user} />} />
          <Route path="/game/:id" element={<ShopPage region={region} />} />
          <Route path="/comparison" element={<ComparisonPage region={region} user={user} />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/login" element={<LoginPage user={user} setUser={setUser} />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/recommend/personal" element={<PersonalRecoPage user={user} />} />
          {/* ★ 마이페이지 라우터 등록 */}
          <Route path="/mypage" element={<MyPage user={user} setUser={setUser} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
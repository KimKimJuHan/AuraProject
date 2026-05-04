import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL, apiClient } from './config';
import { safeLocalStorage } from './utils/storage';
import AdminInquiryPage from './pages/Support/AdminInquiryPage';
import FindIdPage from './pages/FindIdPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ShopPage from './ShopPage';
import ComparisonPage from './ComparisonPage';
import SearchResultsPage from './SearchResultsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage'; 
import PersonalRecoPage from './pages/PersonalRecoPage';
import MyPage from './pages/MyPage';
import InquiryNewPage from './pages/Support/InquiryNewPage';
import InquiryListPage from './pages/Support/InquiryListPage';
import FaqPage from './pages/Support/FaqPage';
import ProfileDropdown from './components/ProfileDropdown';
import Skeleton from './Skeleton';
import { formatPrice } from './utils/priceFormatter';
import { checkPcCompatibility } from './utils/pcCompatibility';
import OnboardingPopup from './components/OnboardingPopup';
import NotificationPage from './pages/NotificationPage';



const TAG_CATEGORIES = {
  '장르':   ['RPG', 'FPS', '액션', '어드벤처', '전략', '턴제', '시뮬레이션', '퍼즐', '플랫포머', '공포', '생존', '로그라이크', '소울라이크', '메트로배니아', '리듬', '격투', '카드게임', 'MOBA', '배틀로얄', '비주얼노벨'],
  '시점':   ['1인칭', '3인칭', '쿼터뷰', '탑다운', '횡스크롤'],
  '그래픽': ['픽셀아트', '2D', '3D', '애니메이션풍', '현실적', '귀여운', '힐링', '캐주얼'],
  '테마':   ['판타지', '다크판타지', 'SF', '우주', '사이버펑크', '스팀펑크', '중세', '역사', '좀비', '포스트아포칼립스', '전쟁', '밀리터리', '현대', '느와르'],
  '특징':   ['오픈월드', '샌드박스', '스토리', '선택지', '멀티엔딩', '고난이도', '협동', '로컬협동', 'PvP', '경쟁', '멀티플레이', '싱글플레이', '캐릭터커스텀', '자원관리', '기지건설'],
};

// 카테고리별 기본 노출 태그 수 (나머지는 '더보기'로 숨김)
const TAG_DEFAULT_SHOW = {
  '장르':   10,  // RPG~소울라이크까지
  '시점':   5,   // 전부 노출
  '그래픽': 6,   // 픽셀아트~귀여운
  '테마':   7,   // 판타지~좀비
  '특징':   8,   // 오픈월드~협동
};

const styles = {
  tabContainer: { display: 'flex', gap:'20px', marginBottom:'20px', borderBottom:'1px solid #333', paddingBottom:'1px' },
  tabButton: { background: 'none', color: '#b3b3b3', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid transparent', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px', transition: 'color 0.2s' },
  tabButtonActive: { background: 'none', color: '#fff', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid #E50914', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px' },
  loadMoreButton: { display: 'block', margin: '40px auto', padding: '12px 30px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid #fff', cursor: 'pointer', borderRadius:'4px', fontSize:'16px' },
  filterContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '40px', alignItems: 'start' },
  filterBox: { backgroundColor: '#181818', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', transition: 'all 0.3s ease' },
  filterHeader: { padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: '#222', borderBottom: '1px solid #333', userSelect: 'none' },
  filterTitle: { fontSize: '14px', color: '#ddd', fontWeight: 'bold' },
  filterArrow: { color: '#666', fontSize: '12px' },
  filterContent: { padding: '15px', display: 'flex', flexWrap: 'wrap', gap: '8px', backgroundColor: '#181818', borderTop: '1px solid #333' },
  tagBtn: { backgroundColor: '#333', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer', transition: '0.2s' },
  tagBtnActive: { backgroundColor: '#E50914', borderColor: '#E50914', color: 'white', fontWeight: 'bold', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer' },
  tagBtnDisabled: { backgroundColor: '#222', border: '1px solid #2a2a2a', color: '#444', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'not-allowed', opacity: 0.5 },
  heartBtn: { position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '16px', zIndex: 5 },
  navBar: { width: '100%', backgroundColor: '#000000', padding: '15px 4%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box', borderBottom: '1px solid #333', position:'sticky', top:0, zIndex:1000 },
  searchContainer: { position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' },
  clearButton: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#999', fontSize: '18px', cursor: 'pointer' },
  suggestionsList: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#141414', border: '1px solid #333', listStyle: 'none', padding: 0, margin: 0, zIndex: 1000, marginTop:'5px', maxHeight:'420px', overflowY:'auto' },
  suggestionItem: { padding: '10px 15px', cursor: 'pointer', color: '#fff', borderBottom: '1px solid #222' },
  suggestionItemSelected: { padding: '10px 15px', cursor: 'pointer', color: '#fff', backgroundColor: '#333', fontWeight: 'bold', borderBottom: '1px solid #222' },
  clearHistoryButton: { padding: '10px', cursor: 'pointer', color: '#E50914', textAlign: 'center', fontSize: '13px' },
  rightGroup: { display: 'flex', alignItems: 'center', gap: '15px' },
  regionSelect: { backgroundColor: '#000', color: '#fff', border: '1px solid #555', padding: '5px', borderRadius: '4px', fontSize: '13px' },
  suggestionGameRow: { display:'flex', alignItems:'center', gap:'10px', width:'100%' },
  suggestionThumb: { width:'56px', height:'32px', objectFit:'cover', borderRadius:'4px', flexShrink:0, backgroundColor:'#222', border:'1px solid #333' },
  suggestionTextWrap: { display:'flex', flexDirection:'column', minWidth:0, flex:1 },
  suggestionTitle: { color:'#fff', fontSize:'14px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  suggestionSubtitle: { color:'#888', fontSize:'12px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:'2px' },
  historyRow: { display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px' },
  historyDelete: { color:'#999', cursor:'pointer', fontSize:'14px', flexShrink:0 },
  highlightText: { fontWeight: '800', color: '#fff' },
  bellIcon: { background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer', position: 'relative' },
  badge: { position: 'absolute', top: '-5px', right: '-5px', backgroundColor: '#E50914', color: '#fff', fontSize: '10px', fontWeight: 'bold', borderRadius: '50%', padding: '2px 6px' },
  notiDropdown: { position: 'absolute', top: '120%', right: 0, backgroundColor: '#202020', border: '1px solid #444', borderRadius: '8px', width: '300px', maxHeight: '400px', overflowY: 'auto', zIndex: 1001, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', overflow: 'hidden' },
  notiItem: { padding: '12px 15px', borderBottom: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '5px', textDecoration: 'none' },
  notiTitle: { color: '#fff', fontSize: '14px', fontWeight: 'bold' },
  notiMessage: { color: '#aaa', fontSize: '12px', lineHeight: '1.4' },
  headerNickname: { color: '#fff', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap' },
  authButton: { backgroundColor: '#E50914', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' },
  logoutButton: { backgroundColor: '#E50914', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap' }
};

const FilterCategoryBox = ({ title, tags, selectedTags, onToggleTag, validTags }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const hasSelection = selectedTags.length > 0;
  const shouldUseRestriction = hasSelection && selectedTags.length >= 2 && validTags.length > 0;

  const defaultShow = TAG_DEFAULT_SHOW[title] || tags.length;
  const hasMore = tags.length > defaultShow;
  const hiddenSelected = !showAll && tags.slice(defaultShow).some(t => selectedTags.includes(t));
  const displayTags = (showAll || hiddenSelected) ? tags : tags.slice(0, defaultShow);

  return (
      <div style={styles.filterBox}>
          <div style={styles.filterHeader} onClick={() => setIsOpen(!isOpen)}>
              <span style={styles.filterTitle}>
                {title}
                {selectedTags.filter(t => tags.includes(t)).length > 0 && (
                  <span style={{marginLeft:'6px', backgroundColor:'#E50914', color:'#fff', borderRadius:'10px', padding:'1px 7px', fontSize:'11px', fontWeight:'bold'}}>
                    {selectedTags.filter(t => tags.includes(t)).length}
                  </span>
                )}
              </span>
              <span style={styles.filterArrow}>{isOpen ? '▲' : '▼'}</span>
          </div>
          {isOpen && (
              <div style={styles.filterContent}>
                  {displayTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      const isDisabled = shouldUseRestriction && !isSelected && !validTags.includes(tag);
                      return (
                          <button
                              key={tag}
                              style={isSelected ? styles.tagBtnActive : isDisabled ? styles.tagBtnDisabled : styles.tagBtn}
                              onClick={() => !isDisabled && onToggleTag(tag)}
                              disabled={isDisabled}
                          >
                              {tag}
                          </button>
                      );
                  })}
                  {hasMore && !hiddenSelected && (
                      <button
                          onClick={(e) => { e.stopPropagation(); setShowAll(!showAll); }}
                          style={{
                              backgroundColor: 'transparent',
                              border: '1px dashed #555',
                              color: '#888',
                              padding: '4px 10px',
                              borderRadius: '15px',
                              fontSize: '11px',
                              cursor: 'pointer',
                          }}
                      >
                          {showAll ? '▲ 접기' : `+${tags.length - defaultShow}개 더보기`}
                      </button>
                  )}
              </div>
          )}
      </div>
  );
};

function GameListItem({ game, region, userWishlist, onToggleWishlist, user }) {
  const isWishlisted = userWishlist.includes(game.slug);

  const isOwned = user?.steamGames?.some(sg => sg.appid === game.steam_appid);

  const handleHeartClick = (e) => {
    e.preventDefault(); 
    e.stopPropagation();
    
    if (!user) {
        alert("로그인이 필요한 기능입니다.");
        return;
    }
    onToggleWishlist(game.slug, isWishlisted);
  };

  const currentPriceText = formatPrice(game.price_info, region);
  const discount = game.price_info?.discount_percent > 0 ? `-${game.price_info.discount_percent}%` : null;
  const compatibility = checkPcCompatibility(game);

  return (
    <Link to={`/game/${game.slug}`} className="net-card">
        <div className="net-card-thumb">
            <img src={game.main_image} alt={game.title} onError={(e) => e.target.src = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"} />
            <div className="net-card-gradient"></div>
            {discount && <div style={{position:'absolute', top:5, left:5, background:'#E50914', color:'white', padding:'2px 6px', borderRadius:'4px', fontSize:'12px', fontWeight:'bold'}}>{discount}</div>}
            
            {isOwned && <div style={{position:'absolute', top:10, right:45, background:'rgba(27,40,56,0.9)', color:'#66c0f4', padding:'2px 6px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold', border:'1px solid #66c0f4', zIndex: 4}}>보유중</div>}
            
            <button style={styles.heartBtn} onClick={handleHeartClick}>{isWishlisted ? '♥' : '♡'}</button>
        </div>
        <div className="net-card-body">
            <div className="net-card-title">{game.title_ko || game.title}</div>
            <div style={{ color:'#38bdf8', fontSize:'12px', marginTop:'6px', marginBottom:'8px', lineHeight:'1.4', minHeight:'34px' }}>
              {game.reason || '이 조건에 잘 맞아 추천'}
            </div>

            <div
              style={{
                color: compatibility.color,
                background: compatibility.background,
                border: `1px solid ${compatibility.border}`,
                borderRadius: '999px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 'bold',
                width: 'fit-content',
                marginBottom: '8px'
              }}
            >
              {compatibility.icon} {compatibility.label}
            </div>

            <div className="net-card-footer">
                <div style={{display:'flex', flexDirection:'column'}}>
                    <span style={{color: currentPriceText === "무료" ? '#46d369' : '#fff', fontWeight:'bold', fontSize:'14px'}}>
                        {currentPriceText}
                    </span>
                </div>
            </div>
        </div>
    </Link>
  );
}

function MainPage({ user, region }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('popular');
  const [selectedTags, setSelectedTags] = useState([]);
  const [validTags, setValidTags] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  
  const [userWishlist, setUserWishlist] = useState([]);

  useEffect(() => {
    if (user && user._id) {
        apiClient.get('/user/wishlist')
            .then(res => setUserWishlist(res.data || []))
            .catch(err => console.error("찜 목록 로드 실패:", err));
    } else {
        setUserWishlist([]); 
    }
  }, [user]);

  const handleToggleWishlist = async (gameSlug, isCurrentlyWished) => {
      if (isCurrentlyWished) {
          setUserWishlist(prev => prev.filter(slug => slug !== gameSlug));
      } else {
          setUserWishlist(prev => [...prev, gameSlug]);
      }

      try {
          if (isCurrentlyWished) {
              await apiClient.delete(`/user/wishlist/${gameSlug}`);
          } else {
              await apiClient.post(`/user/wishlist`, { slug: gameSlug });
          }
      } catch (err) {
          console.error("찜하기 DB 동기화 실패:", err);
          if (isCurrentlyWished) {
              setUserWishlist(prev => [...prev, gameSlug]);
          } else {
              setUserWishlist(prev => prev.filter(slug => slug !== gameSlug));
          }
          alert("찜하기 처리 중 서버 오류가 발생했습니다.");
      }
  };

  useEffect(() => {
    setGames([]);
    setPage(1);
    setHasMore(true);
  }, [selectedTags, activeTab]);

  useEffect(() => {
    if (page > 1 && !hasMore) return;

    const fetchGames = async () => {
        setLoading(true);
        setError(null);
        const currentPlayerType = user?.playerType || 'beginner';
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: user?._id, // ★ 백엔드로 전달하여 보유 게임을 거를 수 있도록 추가
                    tags: selectedTags, 
                    sortBy: activeTab, 
                    page,
                    playerType: currentPlayerType
                })
            });
            if (!response.ok) throw new Error("서버 연결 실패");
            const data = await response.json();

            if (data.validTags) setValidTags(data.validTags);

            setGames(prev => {
                if (page === 1) return data.games;
                const newGames = data.games.filter(g => !prev.some(p => p.slug === g.slug));
                return [...prev, ...newGames];
            });
            setHasMore(page < data.totalPages);
        } catch (err) {
            setError("서버와 연결할 수 없습니다.");
        } finally {
            setLoading(false);
        }
    };

    fetchGames();
  }, [page, selectedTags, activeTab, user, hasMore]);

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  return (
    <div className="net-panel">
      <div style={styles.tabContainer}>
        {/* ★ 상단 탭 신규 항목 삭제, 원래 상태로 롤백 완료 */}
        {[{ k:'popular', n:'인기 추천' }, { k:'new', n:'신규 출시' }, { k:'discount', n:'할인 중' }, { k:'price', n:'낮은 가격' }].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)} style={activeTab === t.k ? styles.tabButtonActive : styles.tabButton}>{t.n}</button>
        ))}
      </div>

      <div style={styles.filterContainer}>
          {Object.entries(TAG_CATEGORIES).map(([category, tags]) => (
              <FilterCategoryBox key={category} title={category} tags={tags} selectedTags={selectedTags} onToggleTag={toggleTag} validTags={validTags} />
          ))}
      </div>

      {selectedTags.length > 0 && (
        <div style={{marginBottom:'20px', color:'#b3b3b3', fontSize:'14px', textAlign:'right'}}>
            선택된 태그: <span style={{color:'white'}}>{selectedTags.join(', ')}</span>
            <button onClick={() => setSelectedTags([])} style={{marginLeft:'10px', background:'none', border:'none', color:'#E50914', cursor:'pointer', textDecoration:'underline'}}>초기화</button>
        </div>
      )}

      {error ? (
        <div style={{textAlign:'center', marginTop:'50px', color:'#ff4444', fontSize:'18px'}}>{error}</div>
      ) : (
        <div className="net-cards">
          {games.map(game => (
              <GameListItem 
                  key={game.slug} 
                  game={game} 
                  region={region} 
                  userWishlist={userWishlist} 
                  onToggleWishlist={handleToggleWishlist} 
                  user={user}
              />
          ))}
          {loading && Array(5).fill(0).map((_, i) => <Skeleton key={i} height="200px" />)}
        </div>
      )}

      {!loading && !error && hasMore && <button style={styles.loadMoreButton} onClick={() => setPage(p => p+1)}>더 보기 ∨</button>}
      {!loading && !error && games.length === 0 && <div style={{textAlign:'center', marginTop:'50px', color:'#666'}}>조건에 맞는 게임이 없습니다.</div>}
    </div>
  );
}

function NavigationBar({ user, setUser, region, setRegion, onCurrencyChange, handleLogout }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]); 
  const [history, setHistory] = useState([]); 
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const [notifications, setNotifications] = useState([]);
  const [showNoti, setShowNoti] = useState(false);
  const notiRef = useRef(null);
  
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
    if (user) {
      apiClient.get('/notifications').then(res => {
        if (res.data.success) setNotifications(res.data.notifications);
      }).catch(e => console.error("알림 조회 실패", e));
    } else {
      setNotifications([]);
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) setIsFocused(false);
      if (notiRef.current && !notiRef.current.contains(event.target)) setShowNoti(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotiClick = async () => {
    setShowNoti(!showNoti);
    if (!showNoti) {
        const unread = notifications.filter(n => !n.isRead);
        if (unread.length > 0) {
            try {
                await apiClient.post('/notifications/read-all');
                setNotifications(notifications.map(n => ({ ...n, isRead: true })));
            } catch(e) {}
        }
    }
  };

  const fetchSuggestions = async (query) => {
    if (query.length < 1) { setSuggestions([]); return; }
    try {
      const response = await apiClient.get(`/search/autocomplete?q=${query}`);
      setSuggestions(response.data || []);
      setSelectedIndex(-1); 
    } catch (err) { setSuggestions([]); }
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
        else { setSearchTerm(item); navigate(`/search?q=${item}`); setIsFocused(false); }
      } else { handleSubmit(e); }
    } else if (e.key === 'Escape') {
      setIsFocused(false); setSelectedIndex(-1);
    }
  };
  
  const handleClearHistory = () => {
    setHistory([]); safeLocalStorage.removeItem('gameSearchHistory'); setIsFocused(false); navigate('/search');
  };

  const handleClear = () => {
    setSearchTerm(""); setSuggestions([]); setSelectedIndex(-1); setIsFocused(true); 
  };

  const handleDeleteHistoryItem = (itemToDelete, e) => {
    e.stopPropagation();
    const newHistory = history.filter(h => h !== itemToDelete);
    setHistory(newHistory); safeLocalStorage.setItem('gameSearchHistory', JSON.stringify(newHistory));
  };

  const highlightMatch = (text, keyword) => {
    if (!text) return null;
    if (!keyword || !keyword.trim()) return text;
    const normalizedText = String(text); 
    const normalizedKeyword = String(keyword).trim();
    const lowerText = normalizedText.toLowerCase(); 
    const lowerKeyword = normalizedKeyword.toLowerCase();
    const matchIndex = lowerText.indexOf(lowerKeyword);
    if (matchIndex === -1) return normalizedText;
    const before = normalizedText.slice(0, matchIndex);
    const match = normalizedText.slice(matchIndex, matchIndex + normalizedKeyword.length);
    const after = normalizedText.slice(matchIndex + normalizedKeyword.length);
    return <>{before}<span style={styles.highlightText}>{match}</span>{after}</>;
  };

  const renderSuggestionItem = (item, idx) => {
    const itemStyle = idx === selectedIndex ? styles.suggestionItemSelected : styles.suggestionItem;
    if (item.slug) {
      return (
        <li key={item.slug || idx} style={itemStyle} onMouseDown={() => handleSuggestionClick(item)}>
          <div style={styles.suggestionGameRow}>
            <img
              src={item.main_image || "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"}
              alt={item.title}
              style={styles.suggestionThumb}
              onError={(e) => { e.target.src = "https://via.placeholder.com/300x169/141414/ffffff?text=No+Image"; }}
            />
            <div style={styles.suggestionTextWrap}>
              <span style={styles.suggestionTitle}>{highlightMatch(item.title, searchTerm)}</span>
              {item.title_ko && <span style={styles.suggestionSubtitle}>{highlightMatch(item.title_ko, searchTerm)}</span>}
            </div>
          </div>
        </li>
      );
    }
    return (
      <li key={`${item}-${idx}`} style={itemStyle} onMouseDown={() => { setSearchTerm(item); navigate(`/search?q=${item}`); setIsFocused(false); }}>
        <div style={styles.historyRow}>
          <span>{item}</span>
          <span onMouseDown={(e) => handleDeleteHistoryItem(item, e)} style={styles.historyDelete}>✕</span>
        </div>
      </li>
    );
  };

  const currentList = searchTerm.length > 0 ? suggestions : history;

  const handleRegionChange = (e) => {
    const selected = e.target.value;
    setRegion(selected);
    if (onCurrencyChange) {
      const newCurrency = selected === 'KR' ? 'KRW' : 'USD';
      onCurrencyChange(newCurrency);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

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
        {isFocused && (
          <ul style={styles.suggestionsList}>
            {currentList.map((item, idx) => renderSuggestionItem(item, idx))}
            {searchTerm.length === 0 && history.length > 0 && (
              <li style={styles.clearHistoryButton} onMouseDown={handleClearHistory}>기록 삭제</li>
            )}
          </ul>
        )}
      </div>

      <div style={styles.rightGroup}>
        <select style={styles.regionSelect} value={region} onChange={handleRegionChange}>
          <option value="KR">🇰🇷 KRW</option>
          <option value="US">🇺🇸 USD</option>
          <option value="JP">🇯🇵 JPY</option>
        </select>

        {user && (
          <div style={{ position: 'relative' }} ref={notiRef}>
            <button style={styles.bellIcon} onClick={handleNotiClick}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
            </button>
            {showNoti && (
              <div style={styles.notiDropdown}>
                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '15px', color: '#999', textAlign: 'center', fontSize: '14px' }}>
                      새로운 알림이 없습니다.
                    </div>
                  ) : (
                    notifications.map(n => (
                      <Link 
                        to={`/game/${n.gameSlug}`} 
                        key={n._id} 
                        style={{ ...styles.notiItem, backgroundColor: n.isRead ? '#202020' : '#2a2a2a' }}
                        onClick={() => setShowNoti(false)}
                      >
                        <div style={styles.notiTitle}>{n.title}</div>
                        <div style={styles.notiMessage}>{n.message}</div>
                      </Link>
                    ))
                  )}
                </div>
                
                <Link 
                    to="/notifications" 
                    style={{ 
                        display: 'block', 
                        padding: '12px', 
                        textAlign: 'center', 
                        backgroundColor: '#181818', 
                        color: '#E50914', 
                        textDecoration: 'none', 
                        fontSize: '14px', 
                        fontWeight: 'bold',
                        borderTop: '1px solid #333'
                    }}
                    onClick={() => setShowNoti(false)}
                >
                    모든 알림 보기
                </Link>
              </div>
            )}
          </div>
        )}

        {user && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={styles.headerNickname}>
              {(user.displayName || user.nickname || user.name || user.username || '사용자')}님
            </span>
            {user.playerType === 'streamer' && <span style={{background:'#8a2be2', color:'#fff', padding:'2px 6px', borderRadius:'4px', fontSize:'10px', marginLeft:'6px', fontWeight:'bold'}}>스트리머</span>}
            {user.playerType === 'intermediate' && <span style={{background:'#00bfff', color:'#fff', padding:'2px 6px', borderRadius:'4px', fontSize:'10px', marginLeft:'6px', fontWeight:'bold'}}>중급자</span>}
            {user.playerType === 'beginner' && <span style={{background:'#666', color:'#fff', padding:'2px 6px', borderRadius:'4px', fontSize:'10px', marginLeft:'6px', fontWeight:'bold'}}>초심자</span>}
          </div>
        )}

        {!user ? (
          <Link to="/login" style={styles.authButton}>
            로그인
          </Link>
        ) : (
          <button onClick={handleLogout} style={{marginLeft:'15px', ...styles.logoutButton}}>
            로그아웃
          </button>
        )}

        <ProfileDropdown user={user} />
      </div>
    </header>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [region, setRegion] = useState('KR');
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'KRW');

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

  const handleCurrencyChange = (newCurrency) => {
    localStorage.setItem('currency', newCurrency);
    setCurrency(newCurrency);
    window.dispatchEvent(new Event('currencyChanged')); 
  };

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
      setUser(null);
      alert("성공적으로 로그아웃 되었습니다.");
      window.location.reload();
    } catch (error) {
      console.error("로그아웃 실패", error);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white', backgroundColor: '#121212' }}>
        Loading AuraProject...
      </div>
    );
  }

  return (
    <Router>
      <div className="net-app">
        <NavigationBar 
          user={user}
          setUser={setUser}
          region={region}
          setRegion={setRegion}
          onCurrencyChange={handleCurrencyChange}
          handleLogout={handleLogout} 
        />
        <OnboardingPopup />
        <Routes>
          <Route path="/" element={<MainPage region={region} user={user} currency={currency} />} />
          <Route path="/game/:id" element={<ShopPage region={region} user={user} />} />
          <Route path="/comparison" element={<ComparisonPage region={region} user={user} />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/login" element={<LoginPage user={user} setUser={setUser} />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/recommend/personal" element={<PersonalRecoPage user={user} />} />
          <Route path="/mypage" element={<MyPage user={user} setUser={setUser} />} />
          <Route path="/support/faq" element={<FaqPage />} />
          <Route path="/support/inquiry" element={<InquiryListPage user={user} />} />
          <Route path="/support/inquiry/new" element={<InquiryNewPage user={user} />} />
          <Route path="/admin/support/inquiries" element={<AdminInquiryPage user={user} />} />
          <Route path="/find-id" element={<FindIdPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/change-password" element={<ChangePasswordPage user={user} />} />
          <Route path="/notifications" element={<NotificationPage user={user} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
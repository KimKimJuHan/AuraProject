import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
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
import OnboardingPage from './pages/OnboardingPage';
import { useTheme } from './context/ThemeContext';

function NotFoundPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', color: '#fff', textAlign: 'center'
    }}>
      <div style={{ fontSize: '80px', fontWeight: 'bold', color: '#E50914', lineHeight: 1 }}>404</div>
      <div style={{ fontSize: '22px', margin: '16px 0 8px', fontWeight: 'bold' }}>페이지를 찾을 수 없습니다</div>
      <div style={{ color: '#888', fontSize: '14px', marginBottom: '28px' }}>
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </div>
      <a href="/" style={{
        background: '#E50914', color: '#fff', padding: '12px 28px',
        borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px'
      }}>메인으로 돌아가기</a>
    </div>
  );
}

const TAG_CATEGORIES = {
  '장르':   ['RPG', 'FPS', '액션', '어드벤처', '전략', '턴제', '시뮬레이션', '퍼즐', '플랫포머', '공포', '생존', '로그라이크', '소울라이크', '메트로배니아', '리듬', '격투', '카드게임', 'MOBA', '배틀로얄', '비주얼노벨'],
  '시점':   ['1인칭', '3인칭', '쿼터뷰', '탑다운', '횡스크롤'],
  '그래픽': ['픽셀아트', '2D', '3D', '애니메이션풍', '현실적', '귀여운', '힐링', '캐주얼'],
  '테마':   ['판타지', '다크판타지', 'SF', '우주', '사이버펑크', '스팀펑크', '중세', '역사', '좀비', '포스트아포칼립스', '전쟁', '밀리터리', '현대', '느와르'],
  '특징':   ['오픈월드', '샌드박스', '스토리', '선택지', '멀티엔딩', '고난이도', '협동', '로컬협동', 'PvP', '경쟁', '멀티플레이', '싱글플레이', '캐릭터커스텀', '자원관리', '기지건설'],
};

const TAG_DEFAULT_SHOW = {
  '장르':   10,
  '시점':   5,
  '그래픽': 6,
  '테마':   7,
  '특징':   8,
};

const styles = {
  tabContainer: { display: 'flex', gap:'20px', marginBottom:'20px', borderBottom:'1px solid #333', paddingBottom:'1px', overflowX:'auto', flexWrap:'nowrap' },
  tabButton: { background: 'none', color: '#b3b3b3', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid transparent', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px', transition: 'color 0.2s' },
  tabButtonActive: { background: 'none', color: '#fff', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid #E50914', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px' },
  loadMoreButton: { display: 'block', margin: '40px auto', padding: '12px 30px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid #fff', cursor: 'pointer', borderRadius:'4px', fontSize:'16px' },
  filterContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '40px', alignItems: 'start' },
  filterBox: { backgroundColor: 'var(--bg-card)', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', transition: 'all 0.3s ease' },
  filterHeader: { padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid #333', userSelect: 'none' },
  filterTitle: { fontSize: '14px', color: 'var(--text-primary)', fontWeight: 'bold' },
  filterArrow: { color: 'var(--text-secondary)', fontSize: '12px' },
  filterContent: { padding: '15px', display: 'flex', flexWrap: 'wrap', gap: '8px', backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border)' },
  tagBtn: { backgroundColor: 'var(--bg-hover)', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer', transition: '0.2s' },
  tagBtnActive: { backgroundColor: '#E50914', borderColor: '#E50914', color: 'white', fontWeight: 'bold', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer' },
  tagBtnDisabled: { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-disabled)', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'not-allowed', opacity: 0.5 },
  heartBtn: { position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', zIndex: 5 },
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
      <div className="filter-box-wrap" style={styles.filterBox}>
          <div className="filter-box-header" style={styles.filterHeader} onClick={() => setIsOpen(!isOpen)}>
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
              <div className="filter-box-content" style={styles.filterContent}>
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

  // 무료배포 게임(slug 없음)은 외부 링크로
  const CardWrapper = game.is_giveaway && !game.slug ? 'a' : Link;

  return (
    <CardWrapper
      {...(game.is_giveaway && !game.slug
        ? { href: game.giveaway_url, target: '_blank', rel: 'noopener noreferrer' }
        : { to: `/game/${game.slug}` })}
      className="net-card"
    >
        <div className="net-card-thumb">
            <img loading="lazy" src={game.main_image} alt={game.title} onError={(e) => e.target.src = "data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22300%22 height%3D%22169%22%3E%3Crect width%3D%22300%22 height%3D%22169%22 fill%3D%22%23202020%22%2F%3E%3Ctext x%3D%22150%22 y%3D%2290%22 font-family%3D%22sans-serif%22 font-size%3D%2214%22 fill%3D%22%23555%22 text-anchor%3D%22middle%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E"} />
            <div className="net-card-gradient"></div>
            {discount && <div style={{position:'absolute', top:5, left:5, background:'#E50914', color:'white', padding:'2px 6px', borderRadius:'4px', fontSize:'12px', fontWeight:'bold'}}>{discount}</div>}
            {game.is_giveaway && <div style={{position:'absolute', top:5, left:5, background:'#46d369', color:'#000', padding:'2px 6px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold'}}>무료배포</div>}
            
            {isOwned && <div style={{position:'absolute', top:10, right:45, background:'rgba(27,40,56,0.9)', color:'#66c0f4', padding:'2px 6px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold', border:'1px solid #66c0f4', zIndex: 4}}>보유중</div>}
            
            <button style={{...styles.heartBtn, color: isWishlisted ? '#E50914' : '#fff'}} onClick={handleHeartClick}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isWishlisted ? '#E50914' : 'none'} stroke={isWishlisted ? '#E50914' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
        </div>
        <div className="net-card-body">
            <div className="net-card-title">{game.title_ko || game.title}</div>
            <div style={{ color:'#888', fontSize:'11px', marginTop:'6px', marginBottom:'6px', lineHeight:'1.4', minHeight:'28px' }}>
              {game.is_giveaway
                ? (game.original_worth && game.original_worth !== 'N/A'
                    ? <span>원가 <span style={{textDecoration:'line-through'}}>{game.original_worth}</span> → <span style={{color:'#46d369', fontWeight:'bold'}}>무료</span></span>
                    : '기간 한정 무료 배포')
                : (game.reason || '맞춤 추천')}
            </div>

            {game.steam_reviews?.overall?.percent > 0 && game.steam_reviews?.overall?.total >= 10 && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'3px' }}>
                  <span style={{ fontSize:'11px', color: game.steam_reviews.overall.percent >= 80 ? '#66c0f4' : game.steam_reviews.overall.percent >= 60 ? '#d29922' : '#ff7b72' }}>
                    {({'Overwhelmingly Positive':'압도적으로 긍정적','Very Positive':'매우 긍정적','Positive':'긍정적','Mostly Positive':'대체로 긍정적','Mixed':'복합적','Mostly Negative':'대체로 부정적','Negative':'부정적','Very Negative':'매우 부정적','Overwhelmingly Negative':'압도적으로 부정적'})[game.steam_reviews.overall.summary] || (game.steam_reviews.overall.percent >= 80 ? '긍정적' : '복합적')}
                  </span>
                  <span style={{ fontSize:'11px', color:'#888' }}>{game.steam_reviews.overall.percent}%</span>
                </div>
                <div style={{ background:'#333', borderRadius:'3px', height:'3px', overflow:'hidden' }}>
                  <div style={{
                    width: `${game.steam_reviews.overall.percent}%`, height:'100%',
                    background: game.steam_reviews.overall.percent >= 80 ? '#66c0f4' : game.steam_reviews.overall.percent >= 60 ? '#d29922' : '#ff7b72',
                    borderRadius:'3px'
                  }}/>
                </div>
              </div>
            )}

            {!game.is_giveaway && (
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
            )}

            <div className="net-card-footer">
                <div style={{display:'flex', flexDirection:'column'}}>
                    {game.is_giveaway ? (
                      <>
                        <span style={{color:'#46d369', fontWeight:'bold', fontSize:'13px'}}>{game.shop_name || '무료 배포 중'}</span>
                        {game.expiry && <span style={{color:'#ff9900', fontSize:'11px', marginTop:'2px'}}>⏰ {new Date(game.expiry).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})} 종료</span>}
                      </>
                    ) : (
                      <span style={{color: currentPriceText === "무료" ? '#46d369' : '#fff', fontWeight:'bold', fontSize:'14px'}}>
                        {currentPriceText}
                      </span>
                    )}
                </div>
            </div>
        </div>
    </CardWrapper>
  );
}

function MainPage({ user, region, userWishlist, onToggleWishlist }) {
  // 뒤로가기 시 필터/탭 유지 - sessionStorage에서 복원
  const saved = (() => {
    try { return JSON.parse(sessionStorage.getItem('mainPageState') || '{}'); }
    catch { return {}; }
  })();

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(saved.activeTab || 'popular');
  const [selectedTags, setSelectedTags] = useState(saved.selectedTags || []);
  const [validTags, setValidTags] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const [priceRange, setPriceRange] = useState(saved.priceRange || 'all');
  const [priceMin, setPriceMin] = useState(saved.priceMin || '');
  const [priceMax, setPriceMax] = useState(saved.priceMax || '');
  const [minDiscount, setMinDiscount] = useState(saved.minDiscount || 0);
  const [hideOwned, setHideOwned] = useState(saved.hideOwned || false);

  // 필터/탭 변경 시 sessionStorage에 저장
  useEffect(() => {
    sessionStorage.setItem('mainPageState', JSON.stringify({
      activeTab, selectedTags, priceRange, priceMin, priceMax, minDiscount, hideOwned
    }));
  }, [activeTab, selectedTags, priceRange, priceMin, priceMax, minDiscount, hideOwned]);

  useEffect(() => {
    setGames([]);
    setPage(1);
    setHasMore(true);
  }, [selectedTags, activeTab, priceRange, priceMin, priceMax, minDiscount, hideOwned]);

  useEffect(() => {
    if (page > 1 && !hasMore) return;

    const fetchGames = async () => {
        setLoading(true);
        setError(null);
        const currentPlayerType = user?.playerType || 'beginner';
        
        try {
            // 무료배포 탭 - 별도 API
            if (activeTab === 'giveaway') {
                const gwRes = await fetch(`${API_BASE_URL}/api/games/giveaway`);
                const gwData = await gwRes.json();
                if (gwData.success) {
                    setGames(gwData.games || []);
                    setHasMore(false);
                }
                setLoading(false);
                return;
            }

            const response = await fetch(`${API_BASE_URL}/api/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user?._id,
                    tags: selectedTags,
                    sortBy: activeTab,
                    page,
                    playerType: currentPlayerType,
                    priceRange,
                    priceMin: priceMin ? Number(priceMin) : undefined,
                    priceMax: priceMax ? Number(priceMax) : undefined,
                    minDiscount,
                    hideOwned,
                })
            });
            if (!response.ok) throw new Error("서버 연결 실패");
            const data = await response.json();

            if (data.validTags) setValidTags(data.validTags);

            // 온전하지 않은 카드(이미지·가격 없는 게임)는 하단으로 밀기
            const sortWithIncompleteAtBottom = (list) => {
                const isComplete = (g) =>
                    g.main_image &&
                    g.price_info &&
                    (g.price_info.isFree || (g.price_info.current_price > 0));
                const complete = list.filter(g => isComplete(g));
                const incomplete = list.filter(g => !isComplete(g));
                return [...complete, ...incomplete];
            };

            setGames(prev => {
                if (page === 1) return sortWithIncompleteAtBottom(data.games);
                const newGames = data.games.filter(g => !prev.some(p => p.slug === g.slug));
                return sortWithIncompleteAtBottom([...prev, ...newGames]);
            });
            setHasMore(page < data.totalPages);
        } catch (err) {
            setError("서버와 연결할 수 없습니다.");
        } finally {
            setLoading(false);
        }
    };

    fetchGames();
  }, [page, selectedTags, activeTab, user, hasMore, priceRange, priceMin, priceMax, minDiscount, hideOwned]);

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
      setPage(1);
      setGames([]);
      setHasMore(true);
  };

  return (
    <div className="net-panel">
      <OnboardingPopup />
      <div className="sort-filter-bar" style={{ marginBottom:'24px', borderBottom:'2px solid var(--border)', paddingBottom:'14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'2px', marginBottom: activeTab==='giveaway' ? '0' : '12px', overflowX:'auto', scrollbarWidth:'none' }}>
          {[{k:'popular',n:'인기순'},{k:'rising',n:'급상승'},{k:'new',n:'신작순'},{k:'discount',n:'할인율순'},{k:'price',n:'낮은가격순'},{k:'review',n:'평점순'},{k:'giveaway',n:'무료배포'}].map(t => (
            <button key={t.k} onClick={() => { setActiveTab(t.k); setPage(1); setGames([]); }}
              style={{ padding:'8px 18px', border:'none', cursor:'pointer', fontSize:'14px',
                background:'none', whiteSpace:'nowrap', flexShrink:0, marginBottom:'-2px',
                color: activeTab===t.k ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: activeTab===t.k ? '2px solid #E50914' : '2px solid transparent',
                fontWeight: activeTab===t.k ? '700' : '500', transition:'all 0.15s' }}>{t.n}</button>
          ))}
        </div>
        {activeTab !== 'giveaway' && <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'5px', background:'var(--bg-hover)', borderRadius:'8px', padding:'5px 10px', border:'1px solid var(--border)' }}>
            <span style={{ color:'var(--text-muted)', fontSize:'12px', fontWeight:'600' }}>가격</span>
            <input type="number" inputMode="numeric" placeholder="최소" value={priceMin}
              onChange={e => { setPriceMin(e.target.value); setPriceRange('custom'); setPage(1); setGames([]); }}
              style={{ width:'72px', padding:'3px 6px', borderRadius:'5px', fontSize:'13px',
                border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', outline:'none' }} />
            <span style={{ color:'var(--text-muted)' }}>~</span>
            <input type="number" inputMode="numeric" placeholder="최대" value={priceMax}
              onChange={e => { setPriceMax(e.target.value); setPriceRange('custom'); setPage(1); setGames([]); }}
              style={{ width:'72px', padding:'3px 6px', borderRadius:'5px', fontSize:'13px',
                border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', outline:'none' }} />
            <span style={{ color:'var(--text-muted)', fontSize:'12px' }}>원</span>
          </div>
          {[{k:'free',n:'무료'},{k:'~10000',n:'~1만'},{k:'~30000',n:'~3만'},{k:'~50000',n:'~5만'}].map(p => (
            <button key={p.k} onClick={() => { setPriceRange(p.k); setPriceMin(''); setPriceMax(''); setPage(1); setGames([]); }}
              style={{ padding:'6px 12px', borderRadius:'6px', fontSize:'13px', cursor:'pointer',
                background: priceRange===p.k ? 'rgba(229,9,20,0.15)' : 'var(--bg-hover)',
                color: priceRange===p.k ? '#E50914' : 'var(--text-secondary)',
                border:`1px solid ${priceRange===p.k ? '#E50914':'var(--border)'}`,
                fontWeight: priceRange===p.k ? '700':'400' }}>{p.n}</button>
          ))}
          <div style={{ width:'1px', height:'22px', background:'var(--border)', flexShrink:0 }} />
          <span style={{ color:'var(--text-muted)', fontSize:'12px', fontWeight:'600' }}>할인</span>
          {[{k:0,n:'전체'},{k:25,n:'25%↑'},{k:50,n:'50%↑'},{k:75,n:'75%↑'}].map(d => (
            <button key={d.k} onClick={() => { setMinDiscount(d.k); setPage(1); setGames([]); }}
              style={{ padding:'6px 12px', borderRadius:'6px', fontSize:'13px', cursor:'pointer',
                background: minDiscount===d.k ? '#E50914' : 'var(--bg-hover)',
                color: minDiscount===d.k ? '#fff' : 'var(--text-secondary)',
                border:`1px solid ${minDiscount===d.k ? '#E50914':'var(--border)'}`,
                fontWeight: minDiscount===d.k ? '700':'400' }}>{d.n}</button>
          ))}
          <div style={{ width:'1px', height:'22px', background:'var(--border)', flexShrink:0 }} />
          {/* 빠른 태그 필터 - 정렬/가격/할인과 동시 적용 가능 */}
          {[
            { label:'코옵·멀티', tags:['협동','멀티플레이'] },
            { label:'싱글', tags:['싱글플레이'] },
            { label:'오픈월드', tags:['오픈월드'] },
            { label:'공포', tags:['공포'] },
          ].map(f => {
            const on = f.tags.every(t => selectedTags.includes(t));
            return (
              <button key={f.label} onClick={() => {
                  if (on) setSelectedTags(prev => prev.filter(t => !f.tags.includes(t)));
                  else setSelectedTags(prev => [...new Set([...prev, ...f.tags])]);
                  setPage(1); setGames([]);
                }}
                style={{ padding:'6px 14px', borderRadius:'6px', fontSize:'13px', cursor:'pointer',
                  whiteSpace:'nowrap', flexShrink:0,
                  background: on ? '#E50914' : 'var(--bg-hover)',
                  color: on ? '#fff' : 'var(--text-secondary)',
                  border:`1px solid ${on ? '#E50914':'var(--border)'}`,
                  fontWeight: on ? '700':'500' }}>{f.label}</button>
            );
          })}
          <div style={{ width:'1px', height:'22px', background:'var(--border)', flexShrink:0 }} />
          {user && (
            <button onClick={() => { setHideOwned(v=>!v); setPage(1); setGames([]); }}
              style={{ padding:'6px 12px', borderRadius:'6px', fontSize:'13px', cursor:'pointer',
                background: hideOwned ? '#E50914':'var(--bg-hover)',
                color: hideOwned ? '#fff':'var(--text-secondary)',
                border:`1px solid ${hideOwned ? '#E50914':'var(--border)'}` }}>
              {hideOwned ? '보유 숨김' : '보유 표시'}
            </button>
          )}
          {(priceRange!=='all' || priceMin || priceMax || minDiscount!==0 || hideOwned) && (
            <button onClick={() => { setPriceRange('all'); setPriceMin(''); setPriceMax(''); setMinDiscount(0); setHideOwned(false); setPage(1); setGames([]); }}
              style={{ padding:'6px 12px', borderRadius:'6px', fontSize:'13px', cursor:'pointer',
                background:'none', border:'1px solid #E50914', color:'#E50914', fontWeight:'600' }}>✕ 초기화</button>
          )}
        </div>}
      </div>

      {activeTab === 'giveaway' && (
        <div style={{ marginBottom:'20px', padding:'14px 18px', background:'rgba(70,211,105,0.08)', border:'1px solid rgba(70,211,105,0.3)', borderRadius:'10px', color:'var(--text-secondary)', fontSize:'14px' }}>
          지금 무료로 받을 수 있는 게임이에요. 원래 유료지만 기간 한정 무료 배포 중이며, 인기순으로 정렬됩니다.
        </div>
      )}
      {activeTab !== 'giveaway' && (
        <div style={styles.filterContainer}>
            {Object.entries(TAG_CATEGORIES).map(([category, tags]) => (
                <FilterCategoryBox key={category} title={category} tags={tags} selectedTags={selectedTags} onToggleTag={toggleTag} validTags={validTags} />
            ))}
        </div>
      )}

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
          {games.map((game, idx) => (
              <GameListItem 
                  key={`${game.slug || game.giveaway_url || game.title || 'game'}-${idx}`} 
                  game={game} 
                  region={region} 
                  userWishlist={userWishlist} 
                  onToggleWishlist={onToggleWishlist}
                  user={user}
              />
          ))}
          {loading && Array(5).fill(0).map((_, i) => <Skeleton key={i} height="200px" />)}
        </div>
      )}

      {!loading && !error && hasMore && <button style={styles.loadMoreButton} onClick={() => setPage(p => p+1)}>더 보기 ∨</button>}
      {!loading && !error && !hasMore && games.length > 0 && (
        <div style={{textAlign:'center', marginTop:'30px', marginBottom:'20px', color:'var(--text-muted)', fontSize:'13px'}}>
          — 모든 게임을 불러왔어요 —
        </div>
      )}
      {!loading && !error && games.length === 0 && (
        <div style={{textAlign:'center', marginTop:'60px', color:'var(--text-muted)'}}>
          <div style={{fontSize:'40px', marginBottom:'12px'}}>🔍</div>
          <div style={{fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', marginBottom:'6px'}}>조건에 맞는 게임이 없어요</div>
          <div style={{fontSize:'14px', marginBottom:'20px'}}>필터를 조정하거나 초기화해 보세요.</div>
          {(selectedTags.length > 0 || activeTab!=='popular' || priceRange!=='all' || priceMin || priceMax || minDiscount!==0) && (
            <button onClick={() => {
              setSelectedTags([]); setActiveTab('popular');
              setPriceRange('all'); setPriceMin(''); setPriceMax(''); setMinDiscount(0);
              setHideOwned(false); setPage(1); setGames([]);
            }} style={{ padding:'10px 24px', borderRadius:'8px', cursor:'pointer',
              background:'#E50914', color:'#fff', border:'none', fontSize:'14px', fontWeight:'600' }}>
              필터 모두 초기화
            </button>
          )}
        </div>
      )}
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
            <img loading="lazy"
              src={item.main_image || "data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22300%22 height%3D%22169%22%3E%3Crect width%3D%22300%22 height%3D%22169%22 fill%3D%22%23202020%22%2F%3E%3Ctext x%3D%22150%22 y%3D%2290%22 font-family%3D%22sans-serif%22 font-size%3D%2214%22 fill%3D%22%23555%22 text-anchor%3D%22middle%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E"}
              alt={item.title}
              style={styles.suggestionThumb}
              onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22300%22 height%3D%22169%22%3E%3Crect width%3D%22300%22 height%3D%22169%22 fill%3D%22%23202020%22%2F%3E%3Ctext x%3D%22150%22 y%3D%2290%22 font-family%3D%22sans-serif%22 font-size%3D%2214%22 fill%3D%22%23555%22 text-anchor%3D%22middle%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E'; }}
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

      <div style={styles.rightGroup} className="net-header-right">
        <span className="net-theme-toggle"><ThemeToggleBtn /></span>
  <select style={styles.regionSelect} className="net-region-select" value={region} onChange={handleRegionChange}>
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
            <span style={styles.headerNickname} className="net-header-nickname">
              {(user.displayName || user.nickname || user.name || user.username || '사용자')}님
            </span>
          </div>
        )}

        {!user ? (
          <Link to="/login" style={styles.authButton} className="login-btn">
            로그인
          </Link>
        ) : (
          <button onClick={handleLogout} className="logout-btn" style={{...styles.logoutButton}}>
            로그아웃
          </button>
        )}

        <ProfileDropdown user={user} />
      </div>
    </header>
  );
}

function ThemeToggleBtn() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button className="theme-toggle-btn" onClick={toggleTheme} title="테마 변경">
      {theme === 'dark' ? '라이트 모드' : '다크 모드'}
    </button>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [region, setRegion] = useState('KR');
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'KRW');

  // userWishlist를 App 레벨로 끌어올려 페이지 전환 시에도 하트 상태 유지
  const [userWishlist, setUserWishlist] = useState([]);

  useEffect(() => {
    if (user && (user.id || user._id)) {
      apiClient.get('/user/wishlist')
        .then(res => setUserWishlist(res.data || []))
        .catch(err => console.error('찜 목록 로드 실패:', err));
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
      console.error('찜하기 DB 동기화 실패:', err);
      if (isCurrentlyWished) {
        setUserWishlist(prev => [...prev, gameSlug]);
      } else {
        setUserWishlist(prev => prev.filter(slug => slug !== gameSlug));
      }
      alert('찜하기 처리 중 서버 오류가 발생했습니다.');
    }
  };

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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}>
        Loading AuraProject...
      </div>
    );
  }

  return (
    <Router>
      <div className="net-app" style={{backgroundColor:"var(--bg-primary)",minHeight:"100vh"}}>
        <NavigationBar 
          user={user}
          setUser={setUser}
          region={region}
          setRegion={setRegion}
          onCurrencyChange={handleCurrencyChange}
          handleLogout={handleLogout} 
        />
        <Routes>
          <Route path="/" element={<MainPage region={region} user={user} currency={currency} userWishlist={userWishlist} onToggleWishlist={handleToggleWishlist} />} />
          <Route path="/game/:id" element={<ShopPage region={region} user={user} />} />
          <Route path="/comparison" element={<ComparisonPage region={region} user={user} />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/login" element={<LoginPage user={user} setUser={setUser} />} />
          <Route path="/signup" element={<SignupPage setUser={setUser} />} />
          <Route path="/onboarding" element={user ? <OnboardingPage user={user} setUser={setUser} /> : <Navigate to="/login?redirect=onboarding" replace />} />
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
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Skeleton from './Skeleton';
import { API_BASE_URL, apiClient } from './config';
// eslint-disable-next-line no-unused-vars
import { safeLocalStorage } from './utils/storage';
import PcCompatibilityBadge from './components/PcCompatibilityBadge';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import GameCharts from './components/GameCharts';
import GameGallery from './components/GameGallery';
import MinSpecChecker from "./MinSpecChecker";

const styles = {
  buyButton: {
    display: 'inline-block',
    padding: '10px 20px',
    backgroundColor: '#E50914',
    color: '#FFFFFF',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '700',
    textAlign: 'center',
    boxSizing: 'border-box',
    width: '100%',
    letterSpacing: '0.3px',
  },
  wishlistButton: {
    padding: '8px 16px',
    fontSize: '13px',
    cursor: 'pointer',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: 'var(--text-secondary)',
    border: '1px solid #555',
    borderRadius: '6px',
    fontWeight: '600',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'all 0.15s',
  },
  wishlistButtonActive: {
    padding: '8px 16px',
    fontSize: '13px',
    cursor: 'pointer',
    backgroundColor: 'rgba(229,9,20,0.15)',
    color: '#E50914',
    border: '1px solid #E50914',
    borderRadius: '6px',
    fontWeight: '700',
    width: '100%',
    boxSizing: 'border-box',
  },
  thumbButton: {
    padding: '7px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-muted)',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'all 0.15s',
  },
  thumbButtonActive: {
    padding: '7px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    border: '1px solid #E50914',
    borderRadius: '6px',
    background: 'rgba(229,9,20,0.15)',
    color: '#E50914',
    fontWeight: '700',
    width: '100%',
    boxSizing: 'border-box',
  },
  storeRowLink: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px',
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'var(--bg-card)',
    textDecoration: 'none',
    color: 'var(--text-primary)',
    gap: '10px',
    flexWrap: 'wrap'
  },
  storeName: {
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  infoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: '4px',
    marginRight: '10px',
    fontWeight: 'bold',
    backgroundColor: '#333',
    color: 'var(--text-primary)',
    fontSize: '14px',
    cursor: 'help'
  },
  tooltip: {
    visibility: 'hidden',
    width: 'max-content',
    backgroundColor: 'rgba(0,0,0,0.9)',
    color: 'var(--text-primary)',
    textAlign: 'center',
    borderRadius: '4px',
    padding: '5px 10px',
    position: 'absolute',
    zIndex: 100,
    bottom: '125%',
    left: '50%',
    transform: 'translateX(-50%)',
    opacity: 0,
    transition: 'opacity 0.2s',
    fontSize: '12px',
    fontWeight: 'normal',
    border: '1px solid #555'
  },
  trendBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '6px 12px',
    borderRadius: '4px',
    marginRight: '10px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#fff'
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
    marginTop: '40px'
  },
  chartBox: {
    backgroundColor: 'var(--bg-card)',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    minWidth: 0,
    overflow: 'hidden'
  },
  chartResponsiveBox: {
    width: '100%',
    height: '250px',
    minWidth: 0
  },
  reqTabButton: {
    flex: 1,
    padding: '10px',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid #333',
    color: '#888',
    fontWeight: 'bold',
    fontSize: '16px'
  },
  reqTabButtonActive: {
    flex: 1,
    padding: '10px',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid #E50914',
    color: 'var(--text-primary)',
    fontWeight: 'bold',
    fontSize: '16px'
  },
  actionRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px'
  },
  actionButtons: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    alignItems: 'start',
  },
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '40px',
    marginTop: '40px'
  },
  heroTitle: {
    fontSize: 'clamp(28px, 6vw, 48px)',
    marginBottom: '20px',
    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
    textAlign: 'center',
    wordBreak: 'keep-all',
    lineHeight: 1.2
  }
};

const InfoWithTooltip = ({ text, icon, tooltipText }) => {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={styles.infoBadge}>{icon} {text}</span>
      <span
        style={{
          ...styles.tooltip,
          visibility: hover ? 'visible' : 'hidden',
          opacity: hover ? 1 : 0
        }}
      >
        {tooltipText}
      </span>
    </div>
  );
};

const formatPlayTime = (timeData) => {
  if (!timeData || timeData === '정보 없음') return '정보 없음';

  let val = timeData;
  if (typeof timeData === 'object' && timeData !== null) {
    val = timeData.main || timeData.raw || timeData.extra || '정보 없음';
  }

  if (!val || val === '정보 없음') return '정보 없음';

  const match = String(val).match(/\d+(\.\d+)?/);
  if (!match) return '정보 없음';

  const num = parseFloat(match[0]);
  if (isNaN(num) || num === 0) return '정보 없음';

  const hours = Math.floor(num);
  const minutes = Math.round((num - hours) * 60);

  if (hours === 0 && minutes === 0) return '정보 없음';
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
};

function useCountdown(expiryTimestamp) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!expiryTimestamp) return;

    const intervalId = setInterval(() => {
      const distance = new Date(expiryTimestamp).getTime() - new Date().getTime();

      if (distance < 0) {
        clearInterval(intervalId);
        setTimeLeft('종료됨');
      } else {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${days}일 ${hours}시간 ${minutes}분`);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [expiryTimestamp]);

  return timeLeft;
}

function RecentGames({ currentSlug }) {
  const [games, setGames] = useState([]);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem('recentGames') || '[]');
      const filtered = Array.isArray(data) ? data.filter(g => g && g.slug !== currentSlug) : [];
      setGames(filtered.slice(0, 5));
    } catch (e) {
      setGames([]);
    }
  }, [currentSlug]);

  if (games.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
      {games.map(game => (
        <a
          key={game.slug}
          href={`/game/${game.slug}`}
          style={{ minWidth: '150px', textDecoration: 'none', color: '#fff', flexShrink: 0 }}
        >
          <img
            src={game.main_image}
            alt={game.title}
            style={{
              width: '150px',
              height: '84px',
              borderRadius: '4px',
              objectFit: 'cover',
              marginBottom: '6px'
            }}
          />
          <div
            style={{
              fontSize: '12px',
              color: '#ddd',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {game.title_ko || game.title}
          </div>
        </a>
      ))}
    </div>
  );
}

export default function ShopPage({ region, user }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [gameData, setGameData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [mediaList, setMediaList] = useState([]);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [priceAlert, setPriceAlert] = useState(null);
  const [showPriceAlert, setShowPriceAlert] = useState(false);
  const [priceAlertInput, setPriceAlertInput] = useState('');
  const [priceAlertMsg, setPriceAlertMsg] = useState('');
  const [alertMode, setAlertMode] = useState('price'); // 'price' | 'discount' | 'lowest'
  const [alertDiscount, setAlertDiscount] = useState('');
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [myVote, setMyVote] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reqTab, setReqTab] = useState('minimum');
  const chartWidth = window.innerWidth <= 480 ? 300 : 500;

  const REVIEW_KO = {
    'Overwhelmingly Positive': '압도적으로 긍정적',
    'Very Positive': '매우 긍정적',
    'Positive': '긍정적',
    'Mostly Positive': '대체로 긍정적',
    'Mixed': '복합적',
    'Mostly Negative': '대체로 부정적',
    'Negative': '부정적',
    'Very Negative': '매우 부정적',
    'Overwhelmingly Negative': '압도적으로 부정적',
  };

  const toKoReview = (summary) => REVIEW_KO[summary] || summary || '정보 없음';

  const getReviewColor = (summary) => {
    if (!summary || summary === '정보 없음') return '#aaa';
    if (summary.includes('Positive')) return '#66c0f4';
    if (summary.includes('Mixed')) return '#d29922';
    if (summary.includes('Negative')) return '#ff7b72';
    return '#aaa';
  };

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/games/${id}`);
        const data = res.data;

        setGameData(data);
        setLoading(false);

        try {
          const historyRes = await axios.get(`${API_BASE_URL}/api/games/${id}/history`);
          const dailyMap = {};

          historyRes.data.forEach(item => {
            const d = new Date(item.recordedAt);
            const dateStr = `${d.getMonth() + 1}.${d.getDate()}`;
            
            if (!dailyMap[dateStr]) {
              dailyMap[dateStr] = {
                time: dateStr,
                twitch: 0,
                chzzk: 0,
                soop: 0,
                steam: 0
              };
            }
            
            // 하루에 여러번 수집된 경우, 그날의 최고점(Peak)을 표시하도록 수정
            dailyMap[dateStr].twitch = Math.max(dailyMap[dateStr].twitch, item.twitch_viewers || 0);
            dailyMap[dateStr].chzzk = Math.max(dailyMap[dateStr].chzzk, item.chzzk_viewers || 0);
            dailyMap[dateStr].soop = Math.max(dailyMap[dateStr].soop, item.soop_viewers || 0);
            dailyMap[dateStr].steam = Math.max(dailyMap[dateStr].steam, item.steam_ccu || 0);
          });
          
          // 날짜 오름차순으로 정렬
          const sortedHistory = Object.values(dailyMap).reverse();
          setHistoryData(sortedHistory);
        } catch (e) {}

        const videos = (data.trailers || []).map(url => ({
          type: 'video',
          url: url.replace(/^http:\/\//i, 'https://'),
          thumb: data.main_image
        }));
        const images = (data.screenshots || []).map(url => ({
          type: 'image',
          url,
          thumb: url
        }));

        if (images.length === 0 && data.main_image) {
          images.push({ type: 'image', url: data.main_image, thumb: data.main_image });
        }

        const combinedList = [...videos.slice(0, 2), ...images, ...videos.slice(2)];
        setMediaList(combinedList);

        if (combinedList.length > 0) {
          setSelectedMedia(combinedList[0]);
          setIsPlaying(false);
        }

        // 위시리스트 DB 연동
        if (user?._id) {
          try {
            const wlRes = await apiClient.get('/user/wishlist');
            setIsWishlisted((wlRes.data || []).includes(data.slug));
          } catch { setIsWishlisted(false); }
        } else {
          setIsWishlisted(false);
        }
        setLikes(data.likes_count || 0);
        if (user?._id && data.slug) {
          try {
            const alertRes = await apiClient.get('/user/price-alert/' + data.slug);
            if (alertRes.data?.targetPrice) {
              setPriceAlert(alertRes.data.targetPrice);
              setPriceAlertInput(String(alertRes.data.targetPrice));
            }
          } catch {}
        }
        setDislikes(data.dislikes_count || 0);

        try {
          const voteRes = await axios.get(`${API_BASE_URL}/api/games/${id}/myvote`, {
            withCredentials: true
          });
          if (voteRes.data && voteRes.data.userVote) {
            setMyVote(voteRes.data.userVote);
          }
        } catch (e) {}
      } catch (err) {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [id]);

  useEffect(() => {
    if (!gameData) return;

    try {
      const recent = JSON.parse(localStorage.getItem('recentGames') || '[]');
      const safeRecent = Array.isArray(recent) ? recent : [];
      const recentGame = {
        slug: gameData.slug,
        title: gameData.title,
        title_ko: gameData.title_ko,
        main_image: gameData.main_image
      };
      const updated = [recentGame, ...safeRecent.filter(g => g && g.slug !== gameData.slug)].slice(0, 6);
      localStorage.setItem('recentGames', JSON.stringify(updated));
    } catch (e) {}
  }, [gameData]);

  const getPriceDisplay = (priceVal, isFree) => {
    if (isFree || priceVal === 0) return '무료';
    if (!priceVal) return '가격 정보 없음';

    // DB는 이제 항상 정확한 원화(KRW)로 저장되어 있습니다.
    const krwPrice = priceVal;

    if (krwPrice > 2000000) return '가격 정보 없음';

    const usdPrice = krwPrice / 1350;
    const jpyPrice = krwPrice / 9;

    if (region === 'US') return `$${usdPrice.toFixed(2)}`;
    if (region === 'JP') return `¥${Math.round(jpyPrice).toLocaleString()}`;
    return `₩${Math.round(krwPrice).toLocaleString()}`;
  };

  const handleVote = async (type) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/games/${id}/vote`,
        { type },
        { withCredentials: true }
      );
      setLikes(response.data.likes);
      setDislikes(response.data.dislikes);
      setMyVote(response.data.userVote);
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        if (window.confirm('로그인 후 이용해 주세요. 로그인 페이지로 이동하시겠습니까?')) {
          navigate('/login');
        }
      } else {
        alert('서버 오류로 인해 투표에 실패했습니다.');
      }
    }
  };

  const handleSavePriceAlert = async () => {
    if (!user) return alert('로그인이 필요합니다.');
    let targetPrice = 0;
    const currentPrice = gameData?.price_info?.current_price || 0;
    const regularPrice = gameData?.price_info?.regular_price || currentPrice;

    if (alertMode === 'price') {
      targetPrice = Number(priceAlertInput);
      if (!targetPrice || targetPrice <= 0) return setPriceAlertMsg('올바른 가격을 입력해주세요.');
    } else if (alertMode === 'discount') {
      const pct = Number(alertDiscount);
      if (!pct) return setPriceAlertMsg('할인율을 선택해주세요.');
      targetPrice = Math.round(regularPrice * (1 - pct / 100));
    } else if (alertMode === 'lowest') {
      const deals = gameData?.price_info?.deals || [];
      const lowestDeal = deals.length > 0 ? Math.min(...deals.map(d => d.price)) : currentPrice;
      targetPrice = Math.round(lowestDeal * 0.95);
    }

    if (!targetPrice) return setPriceAlertMsg('목표 가격을 설정할 수 없습니다.');
    try {
      await apiClient.post('/user/price-alert', { slug: gameData.slug, targetPrice });
      setPriceAlert(targetPrice);
      setPriceAlertMsg('설정되었습니다.');
      setTimeout(() => setPriceAlertMsg(''), 3000);
    } catch { setPriceAlertMsg('저장 실패'); }
  };

  const handleDeletePriceAlert = async () => {
    try {
      await apiClient.delete('/user/price-alert/' + gameData.slug);
      setPriceAlert(null);
      setPriceAlertInput('');
      setPriceAlertMsg('알림이 해제되었습니다.');
      setTimeout(() => setPriceAlertMsg(''), 2000);
    } catch {}
  };

  const toggleWishlist = async () => {
    if (!user) {
      if (window.confirm('로그인 후 이용해 주세요. 로그인 페이지로 이동하시겠습니까?')) {
        navigate('/login');
      }
      return;
    }
    const newState = !isWishlisted;
    setIsWishlisted(newState); // 낙관적 업데이트
    try {
      if (newState) {
        await apiClient.post('/user/wishlist', { slug: gameData.slug });
      } else {
        await apiClient.delete(`/user/wishlist/${gameData.slug}`);
      }
    } catch {
      setIsWishlisted(!newState); // 실패 시 롤백
      alert('찜하기 처리 중 오류가 발생했습니다.');
    }
  };

  const cleanHTML = (html) => DOMPurify.sanitize(html);

  const formatDate = (dateString) => {
    if (!dateString) return '정보 없음';
    const d = new Date(dateString);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const countdown = useCountdown(gameData?.price_info?.expiry);

  const formatRequirements = (html) => {
    if (!html || html === '정보 없음') return '정보 없음';
    let safeHtml = cleanHTML(html);
    safeHtml = safeHtml.replace(/<strong>\s*(최소|권장|Minimum|Recommended):?\s*<\/strong><br>/gi, '');
    return safeHtml;
  };

  if (loading) return <div className="net-panel"><Skeleton height="500px" /></div>;
  if (!gameData) return <div className="net-panel net-empty">게임을 찾을 수 없습니다.</div>;

  const pi = gameData.price_info;
  const overall = gameData.steam_reviews?.overall || { summary: '정보 없음', total: 0, percent: 0 };
  const reviewSummaryText = overall.summary;
  const reviewPercent = overall.percent || 0;

  const renderPlayTimeTooltip = () => {
    if (!gameData.play_time || typeof gameData.play_time !== 'object' || gameData.play_time === null) {
      return '평균 플레이 타임';
    }
    return gameData.play_time.extra
      ? `메인+서브: ${formatPlayTime(gameData.play_time.extra)} | 완전 정복: ${formatPlayTime(gameData.play_time.completionist)}`
      : '평균 플레이 타임';
  };

  const renderStoreList = () => {
    const deals = pi?.deals || [];

    // 무료 게임(isFree)은 가격 비교 불필요
    if (pi?.isFree) {
      return (
        <a href={gameData.steam_appid ? `https://store.steampowered.com/app/${gameData.steam_appid}` : '#'}
          target="_blank" rel="noreferrer" style={styles.storeRowLink}>
          <span style={styles.storeName}>Steam</span>
          <span style={{ color: '#46d369', fontWeight: 'bold' }}>무료 플레이</span>
        </a>
      );
    }

    if (deals.length === 0 && pi) {
      return (
        <a href={pi.store_url || (gameData.steam_appid ? `https://store.steampowered.com/app/${gameData.steam_appid}` : '#')} target="_blank" rel="noreferrer" style={styles.storeRowLink}>
          <span style={styles.storeName}>{pi.store_name || 'Steam'}</span>
          <span style={{ color: '#46d369' }}>구매하러 가기 &gt;</span>
        </a>
      );
    }

    const dealHref = (deal) => {
      const shopLower = (deal.shopName || '').toLowerCase();
      // Steam: appid로 직접 링크 (itad.link는 잘못된 게임으로 리다이렉트될 수 있음)
      if (shopLower.includes('steam') && gameData.steam_appid) {
        return `https://store.steampowered.com/app/${gameData.steam_appid}`;
      }
      // Epic: itad.link → Epic 공식 검색으로 대체
      if (shopLower.includes('epic')) {
        if (!deal.url || deal.url.includes('itad.link')) {
          const q = encodeURIComponent(gameData.title || '');
          return `https://store.epicgames.com/browse?q=${q}&sortBy=relevancy`;
        }
        return deal.url;
      }
      // GOG: itad.link → GOG 검색으로 대체
      if (shopLower.includes('gog')) {
        if (!deal.url || deal.url.includes('itad.link')) {
          const q = encodeURIComponent(gameData.title || '');
          return `https://www.gog.com/en/games?query=${q}`;
        }
        return deal.url;
      }
      // Humble: itad.link → Humble 검색으로 대체
      if (shopLower.includes('humble')) {
        if (!deal.url || deal.url.includes('itad.link')) {
          const q = encodeURIComponent(gameData.title || '');
          return `https://www.humblebundle.com/store/search?search=${q}`;
        }
        return deal.url;
      }
      // 그 외 스토어: 기본적으로 deal.url 반환 (itad.link 포함)
      return deal.url || '#';
    };
    return deals.map((deal, idx) => (
      <a key={idx} href={dealHref(deal)} target="_blank" rel="noreferrer" style={styles.storeRowLink}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={styles.storeName}>{deal.shopName}</span>
          {deal.discount > 0 && (
            <span style={{ marginLeft: '10px', color: '#E50914', fontSize: '12px', fontWeight: 'bold' }}>
              -{deal.discount}%
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {deal.regularPrice > deal.price && (
            <span style={{ textDecoration: 'line-through', color: '#888', fontSize: '12px' }}>
              {getPriceDisplay(deal.regularPrice, false)}
            </span>
          )}
          <span style={{ color: '#A24CD9', fontWeight: 'bold' }}>
            {getPriceDisplay(deal.price, false)}
          </span>
          <span style={{ fontSize: '12px', color: '#999' }}>&gt;</span>
        </div>
      </a>
    ));
  };

  return (
    <div>
      <div
        style={{
          position: 'relative',
          height: '40vh',
          width: '100%',
          backgroundImage: `url(${gameData.main_image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(20px) brightness(0.4)',
          zIndex: 0
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '100px',
          left: 0,
          right: 0,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 4%'
        }}
      >
        <h1 style={styles.heroTitle}>{gameData.title_ko || gameData.title}</h1>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <PcCompatibilityBadge game={gameData} />
                    {gameData.steam_ccu > 0 && (
            <span style={{ ...styles.trendBadge, backgroundColor: '#2a475e', border: '1px solid #66c0f4' }}>
              Steam 동시접속 {gameData.steam_ccu.toLocaleString()}명
            </span>
          )}
          {(gameData.twitch_viewers + gameData.chzzk_viewers + (gameData.soop_viewers||0)) > 0 && (
            <span style={{ ...styles.trendBadge, backgroundColor: '#9146FF' }}>
              스트리밍 시청자 {(gameData.twitch_viewers + gameData.chzzk_viewers + (gameData.soop_viewers||0)).toLocaleString()}명
            </span>
          )}
        </div>
      </div>

      <div className="net-panel" style={{ position: 'relative', marginTop: '-10vh', zIndex: 2 }}>
        <GameGallery 
          selectedMedia={selectedMedia} 
          setSelectedMedia={setSelectedMedia} 
          mediaList={mediaList} 
          isPlaying={isPlaying} 
          setIsPlaying={setIsPlaying} 
        />

        <div style={{ display: 'flex', gap: '10px', marginBottom: '40px', flexWrap: 'wrap', alignItems: 'center' }}>
          <InfoWithTooltip text={formatDate(gameData.releaseDate)} tooltipText="출시일" icon="" />

          {gameData.metacritic_score > 0 && (
            <InfoWithTooltip
              text={`Metacritic ${gameData.metacritic_score}`}
              tooltipText="전문가 평점 (메타크리틱)"
              icon=""
            />
          )}

          <InfoWithTooltip
            text={formatPlayTime(gameData.play_time || gameData.playtime)}
            tooltipText={renderPlayTimeTooltip()}
            icon=""
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              marginLeft: '10px',
              paddingLeft: '10px',
              borderLeft: '1px solid #444'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#aaa', gap: '10px', flexWrap: 'wrap' }}>
              <span>모든 평가 ({overall.total.toLocaleString()}개)</span>
              <span style={{ color: getReviewColor(reviewSummaryText), fontWeight: 'bold' }}>
                {toKoReview(reviewSummaryText)} {reviewPercent > 0 ? `(${reviewPercent}%)` : ''}
              </span>
              {reviewPercent > 0 && (
                <div style={{ marginTop: '6px', background: '#333', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${reviewPercent}%`,
                    height: '100%',
                    background: reviewPercent >= 80 ? '#66c0f4' : reviewPercent >= 60 ? '#d29922' : '#ff7b72',
                    borderRadius: '4px',
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 액션 버튼 행 (항상 고정 높이) ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'12px', alignItems:'stretch' }}>
          {pi ? (() => {
            // 메인 버튼: Steam deal 먼저, 없으면 current_price_krw, 그것도 없으면 current_price
            const steamDeal = (pi.deals || []).find(d =>
              (d.shopName || '').toLowerCase().includes('steam')
            );
            // deals.price는 KRW(원화) 기준이므로 getPriceDisplay에서 isBaseKRW 체크 통과
            const steamPrice = steamDeal
              ? steamDeal.price
              : (pi.current_price_krw || pi.current_price);
            const steamUrl = gameData.steam_appid
              ? `https://store.steampowered.com/app/${gameData.steam_appid}`
              : (pi.store_url || '#');
            return (
              <a href={steamUrl} target="_blank" rel="noreferrer" style={styles.buyButton}>
                {getPriceDisplay(steamPrice, pi.isFree)} 구매하기
              </a>
            );
          })() : <div />}
          <button style={isWishlisted ? styles.wishlistButtonActive : styles.wishlistButton} onClick={toggleWishlist}>
            {isWishlisted ? '찜함' : '찜하기'}
          </button>
          <button onClick={() => setShowPriceAlert(v => !v)}
            style={{ background:'none', border:`1px solid ${priceAlert ? '#4CAF50' : '#555'}`,
              color: priceAlert ? '#4CAF50' : '#aaa', padding:'8px 10px',
              borderRadius:'6px', cursor:'pointer', fontSize:'12px', width:'100%' }}>
            {priceAlert ? '₩' + priceAlert.toLocaleString() + ' ✓' : '목표 가격 알림 설정'}
          </button>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
            <button style={myVote === 'like' ? styles.thumbButtonActive : styles.thumbButton}
              onClick={() => handleVote('like')}>추천 {likes}</button>
            <button style={myVote === 'dislike' ? styles.thumbButtonActive : styles.thumbButton}
              onClick={() => handleVote('dislike')}>비추천 {dislikes}</button>
          </div>
        </div>

        {/* 가격 알림 패널 - 버튼 행 아래 별도 렌더 */}
        {showPriceAlert && (
          <div style={{ border:'1px solid var(--border)', borderRadius:'8px', padding:'12px',
            background:'var(--bg-card)', marginBottom:'16px' }}>
            <div style={{ color:'var(--text-secondary)', fontSize:'12px', marginBottom:'10px' }}>알림 방식 선택</div>
            <div style={{ display:'flex', gap:'5px', marginBottom:'10px' }}>
              {[{k:'price',label:'가격 입력'},{k:'discount',label:'할인율 선택'},{k:'lowest',label:'최저가 갱신 시'}].map(m => (
                <button key={m.k} onClick={() => setAlertMode(m.k)}
                  style={{ flex:1, padding:'5px 2px', fontSize:'11px', borderRadius:'5px',
                    background: alertMode === m.k ? '#4CAF50' : 'var(--bg-hover)',
                    color: alertMode === m.k ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${alertMode === m.k ? '#4CAF50' : 'var(--border)'}`, cursor:'pointer' }}>
                  {m.label}
                </button>
              ))}
            </div>
            {alertMode === 'price' && (
              <input type="number" placeholder="목표 가격 (원)" value={priceAlertInput}
                onChange={e => setPriceAlertInput(e.target.value)}
                style={{ width:'100%', background:'var(--bg-input, var(--bg-hover))', border:'1px solid var(--border)', color:'var(--text-primary)',
                  padding:'6px 10px', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box' }}/>
            )}
            {alertMode === 'discount' && (
              <div>
                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                  {[10,20,30,40,50,60,75,90].map(pct => (
                    <button key={pct} onClick={() => setAlertDiscount(String(pct))}
                      style={{ padding:'4px 8px', fontSize:'11px', borderRadius:'4px',
                        background: alertDiscount === String(pct) ? '#4CAF50' : '#2a2a2a',
                        color: alertDiscount === String(pct) ? '#fff' : '#aaa',
                        border:`1px solid ${alertDiscount === String(pct) ? '#4CAF50' : 'var(--border)'}`, cursor:'pointer' }}>
                      {pct}%↑
                    </button>
                  ))}
                </div>
                {alertDiscount && gameData?.price_info?.regular_price > 0 && (
                  <div style={{ color:'var(--text-muted)', fontSize:'11px', marginTop:'5px' }}>
                    목표가: ₩{Math.round((gameData.price_info.regular_price||0) * (1 - Number(alertDiscount)/100)).toLocaleString()} 이하
                  </div>
                )}
              </div>
            )}
            {alertMode === 'lowest' && (
              <div style={{ color:'#aaa', fontSize:'12px', padding:'4px 0' }}>
                현재 최저가보다 5% 더 낮아지면 알림을 드립니다.
                {gameData?.price_info?.deals?.length > 0 && (
                  <div style={{ color:'#4CAF50', marginTop:'3px' }}>
                    현재 최저가: ₩{Math.min(...gameData.price_info.deals.map(d=>d.price)).toLocaleString()}
                  </div>
                )}
              </div>
            )}
            <button onClick={handleSavePriceAlert}
              style={{ width:'100%', marginTop:'10px', background:'#4CAF50', border:'none',
                color:'#fff', padding:'8px', borderRadius:'6px', cursor:'pointer',
                fontSize:'13px', fontWeight:'bold' }}>
              알림 설정
            </button>
            {priceAlert && (
              <button onClick={handleDeletePriceAlert}
                style={{ marginTop:'6px', background:'none', border:'none',
                  color:'var(--text-muted)', cursor:'pointer', fontSize:'12px', textDecoration:'underline', width:'100%' }}>
                알림 해제
              </button>
            )}
            {priceAlertMsg && <div style={{ color:'#4CAF50', fontSize:'12px', marginTop:'6px', textAlign:'center' }}>{priceAlertMsg}</div>}
            <button onClick={() => setShowPriceAlert(false)}
              style={{ marginTop:'4px', background:'none', border:'none',
                color:'#555', cursor:'pointer', fontSize:'12px', float:'right' }}>
              닫기
            </button>
          </div>
        )}

                {pi?.discount_percent > 0 && (
          <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ background: '#E50914', color: '#fff', borderRadius: '6px', padding: '3px 10px', fontSize: '14px' }}>
              -{pi.discount_percent}% 할인 중
            </span>
            {countdown && countdown !== '종료됨' && (
              <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 'normal' }}>
                남은 시간: {countdown}
              </span>
            )}
          </div>
        )}

      {/* 게임 설명 */}
      {gameData.description && (
        <div style={{ marginBottom: '30px' }}>
          <h3 className="net-section-title">게임 소개</h3>
          <div style={{
            color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.8',
            background: 'var(--bg-card)', borderRadius: '8px', padding: '16px 20px',
            border: '1px solid var(--border)'
          }}
            dangerouslySetInnerHTML={{ __html: cleanHTML(gameData.description || '') }}
          />
        </div>
      )}

      {historyData.length > 0 && <GameCharts historyData={historyData} chartWidth={chartWidth} />}

        <div style={styles.bottomGrid}>
          <div style={{ minWidth: 0 }}>
            <h3 className="net-section-title">
              가격 비교
              {pi?.isFree ? (
                <span style={{ fontSize: '13px', fontWeight: 'normal', color: '#46d369', marginLeft: '10px' }}>
                  무료 플레이
                </span>
              ) : pi?.deals?.length > 0 && (() => {
                const lowest = pi.deals.reduce((min, d) => d.price < min.price ? d : min, pi.deals[0]);
                return (
                  <span style={{ fontSize: '13px', fontWeight: 'normal', color: '#46d369', marginLeft: '10px' }}>
                    최저가 {getPriceDisplay(lowest.price, false)} ({lowest.shopName})
                  </span>
                );
              })()}
            </h3>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              {renderStoreList()}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <h3 className="net-section-title">시스템 요구 사항</h3>   

            <div style={{ display: 'flex', marginBottom: '15px', borderBottom: '1px solid #333' }}>
              <button
                onClick={() => setReqTab('minimum')}
                style={reqTab === 'minimum' ? styles.reqTabButtonActive : styles.reqTabButton}
              >
                최소 사양
              </button>
              <button
                onClick={() => setReqTab('recommended')}
                style={reqTab === 'recommended' ? styles.reqTabButtonActive : styles.reqTabButton}
              >
                권장 사양
              </button>
            </div>

            <style>{`
              .req-content {
                font-size: 14px;
                line-height: 1.6;
                color: #acb2b8;
                word-break: break-word;
              }
              .req-content ul { padding-left: 0; margin: 0; list-style: none; }
              .req-content li { margin-bottom: 8px; }
              .req-content strong { color: #66c0f4; font-weight: bold; margin-right: 6px; }
              .req-content br { display: block; content: ""; margin-bottom: 4px; }
            `}</style>

            <div className="req-content" style={{ minHeight: '200px' }}>
              {reqTab === 'minimum' ? (
                <div dangerouslySetInnerHTML={{ __html: formatRequirements(gameData.pc_requirements?.minimum) }} />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: formatRequirements(gameData.pc_requirements?.recommended) }} />
              )}
            </div>
            <MinSpecChecker />
          </div>
        </div>

        <div style={{ marginTop: '60px' }}>
          <h3 className="net-section-title">최근 본 게임</h3>
          <RecentGames currentSlug={gameData.slug} />
        </div>
      </div>
    </div>
  );
}
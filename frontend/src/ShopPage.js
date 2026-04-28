import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Skeleton from './Skeleton';
import { API_BASE_URL } from './config';
import { safeLocalStorage } from './utils/storage';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import MinSpecChecker from "./MinSpecChecker";

const styles = {
  buyButton: {
    display: 'inline-block',
    padding: '12px 30px',
    backgroundColor: '#E50914',
    color: '#FFFFFF',
    textDecoration: 'none',
    borderRadius: '4px',
    fontSize: '18px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    textAlign: 'center',
    boxSizing: 'border-box',
    width: '100%'
  },
  wishlistButton: {
    padding: '10px 20px',
    fontSize: '16px',
    cursor: 'pointer',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    border: '1px solid #fff',
    borderRadius: '4px',
    fontWeight: 'bold',
    width: '100%',
    boxSizing: 'border-box'
  },
  wishlistButtonActive: {
    padding: '10px 20px',
    fontSize: '16px',
    cursor: 'pointer',
    backgroundColor: '#fff',
    color: '#000',
    border: '1px solid #fff',
    borderRadius: '4px',
    fontWeight: 'bold',
    width: '100%',
    boxSizing: 'border-box'
  },
  thumbButton: {
    padding: '10px 15px',
    fontSize: '16px',
    cursor: 'pointer',
    border: '1px solid #555',
    borderRadius: '4px',
    background: 'transparent',
    color: '#fff',
    width: '100%',
    boxSizing: 'border-box'
  },
  thumbButtonActive: {
    padding: '10px 15px',
    fontSize: '16px',
    cursor: 'pointer',
    border: '1px solid #E50914',
    borderRadius: '4px',
    background: '#E50914',
    color: '#fff',
    width: '100%',
    boxSizing: 'border-box'
  },
  galleryContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '40px'
  },
  mainMediaDisplay: {
    width: '100%',
    aspectRatio: '16 / 9',
    backgroundColor: '#000',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid #333',
    position: 'relative'
  },
  mediaStrip: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '10px'
  },
  thumbItem: {
    width: '120px',
    height: '68px',
    borderRadius: '2px',
    cursor: 'pointer',
    objectFit: 'cover',
    border: '2px solid transparent',
    opacity: 0.6
  },
  thumbItemActive: {
    border: '2px solid #E50914',
    opacity: 1
  },
  playButtonOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '60px',
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    zIndex: 10
  },
  storeRowLink: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px',
    borderBottom: '1px solid #333',
    backgroundColor: '#181818',
    textDecoration: 'none',
    color: '#fff',
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
    color: '#fff',
    fontSize: '14px',
    cursor: 'help'
  },
  tooltip: {
    visibility: 'hidden',
    width: 'max-content',
    backgroundColor: 'rgba(0,0,0,0.9)',
    color: '#fff',
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
    backgroundColor: '#181818',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #333',
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
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '16px'
  },
  actionRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    alignItems: 'stretch',
    marginBottom: '40px'
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

export default function ShopPage({ region }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [gameData, setGameData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [mediaList, setMediaList] = useState([]);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [myVote, setMyVote] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reqTab, setReqTab] = useState('minimum');
  const videoRef = useRef(null);
  const chartWidth = window.innerWidth <= 480 ? 300 : 500;

  const handlePlayVideo = () => {
    setIsPlaying(true);
    requestAnimationFrame(() => {
      const v = videoRef.current;
      if (!v) return;
      const p = v.play?.();
      if (p?.catch) p.catch(() => {});
    });
  };

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
            dailyMap[dateStr] = {
              time: dateStr,
              twitch: item.twitch_viewers || 0,
              chzzk: item.chzzk_viewers || 0,
              steam: item.steam_ccu || 0
            };
          });

          setHistoryData(Object.values(dailyMap));
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

        const wishlist = JSON.parse(safeLocalStorage.getItem('gameWishlist') || '[]');
        setIsWishlisted(wishlist.includes(data.slug));
        setLikes(data.likes_count || 0);
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

    const isBaseKRW = priceVal > 500;
    const krwPrice = isBaseKRW ? priceVal : priceVal * 1350;
    const usdPrice = isBaseKRW ? priceVal / 1350 : priceVal;
    const jpyPrice = isBaseKRW ? priceVal / 9 : priceVal * 150;

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

  const toggleWishlist = () => {
    const wishlistStr = safeLocalStorage.getItem('gameWishlist');
    const wishlist = wishlistStr ? JSON.parse(wishlistStr) : [];

    let newWishlist;
    if (isWishlisted) newWishlist = wishlist.filter(slug => slug !== gameData.slug);
    else newWishlist = [...wishlist, gameData.slug];

    safeLocalStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
    setIsWishlisted(!isWishlisted);
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
  const overall = gameData.steam_reviews?.overall || { summary: '정보 없음', total: 0 };
  const reviewSummaryText = overall.summary;

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

    if (deals.length === 0 && pi) {
      return (
        <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.storeRowLink}>
          <span style={styles.storeName}>{pi.store_name || '스토어'}</span>
          <span style={{ color: '#46d369' }}>구매하러 가기 &gt;</span>
        </a>
      );
    }

    return deals.map((deal, idx) => (
      <a key={idx} href={deal.url} target="_blank" rel="noreferrer" style={styles.storeRowLink}>
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
          {gameData.steam_ccu > 0 && (
            <span style={{ ...styles.trendBadge, backgroundColor: '#2a475e', border: '1px solid #66c0f4' }}>
              👥 Steam {gameData.steam_ccu.toLocaleString()}명
            </span>
          )}
          {(gameData.twitch_viewers + gameData.chzzk_viewers) > 0 && (
            <span style={{ ...styles.trendBadge, backgroundColor: '#9146FF' }}>
              📺 Live {(gameData.twitch_viewers + gameData.chzzk_viewers).toLocaleString()}명
            </span>
          )}
        </div>
      </div>

      <div className="net-panel" style={{ position: 'relative', marginTop: '-10vh', zIndex: 2 }}>
        <div style={styles.galleryContainer}>
          <div style={styles.mainMediaDisplay}>
            {selectedMedia?.type === 'video' ? (
              <>
                <video
                  ref={videoRef}
                  src={selectedMedia.url}
                  controls={isPlaying}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: isPlaying ? 'block' : 'none'
                  }}
                />
                {!isPlaying && (
                  <>
                    <img
                      src={selectedMedia.thumb}
                      alt="Poster"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                    />
                    <div style={styles.playButtonOverlay} onClick={handlePlayVideo}>▶</div>
                  </>
                )}
              </>
            ) : (
              <img
                src={selectedMedia?.url}
                alt="Main"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )}
          </div>

          <div style={styles.mediaStrip}>
            {mediaList.map((item, idx) => (
              <div
                key={idx}
                style={{ position: 'relative', flexShrink: 0 }}
                onClick={() => {
                  setSelectedMedia(item);
                  setIsPlaying(false);
                }}
              >
                <img
                  src={item.thumb}
                  alt="thumb"
                  style={{
                    ...styles.thumbItem,
                    ...(selectedMedia?.url === item.url ? styles.thumbItemActive : {})
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '40px', flexWrap: 'wrap', alignItems: 'center' }}>
          <InfoWithTooltip text={`📅 ${formatDate(gameData.releaseDate)}`} tooltipText="출시일" icon="" />

          {gameData.metacritic_score > 0 && (
            <InfoWithTooltip
              text={`Metacritic ${gameData.metacritic_score}`}
              tooltipText="전문가 평점 (메타크리틱)"
              icon="Ⓜ️"
            />
          )}

          <InfoWithTooltip
            text={`⏳ ${formatPlayTime(gameData.play_time || gameData.playtime)}`}
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
              <span>모든 평가 ({overall.total.toLocaleString()})</span>
              <span style={{ color: getReviewColor(reviewSummaryText), fontWeight: 'bold' }}>
                {reviewSummaryText}
              </span>
            </div>
          </div>
        </div>

        <div style={styles.actionRow}>
          {pi && (
            <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>
              {getPriceDisplay(pi.current_price, pi.isFree)} 구매하기
            </a>
          )}
          <button
            style={isWishlisted ? styles.wishlistButtonActive : styles.wishlistButton}
            onClick={toggleWishlist}
          >
            {isWishlisted ? '✔ 찜함' : '+ 찜하기'}
          </button>
          <button
            style={myVote === 'like' ? styles.thumbButtonActive : styles.thumbButton}
            onClick={() => handleVote('like')}
          >
            👍 {likes}
          </button>
          <button
            style={myVote === 'dislike' ? styles.thumbButtonActive : styles.thumbButton}
            onClick={() => handleVote('dislike')}
          >
            👎 {dislikes}
          </button>
        </div>

        {pi?.discount_percent > 0 && countdown && (
          <div style={{ color: '#E50914', fontWeight: 'bold', fontSize: '16px', marginBottom: '40px' }}>
            🔥 특가 할인 중! (남은 시간: {countdown})
          </div>
        )}

      {historyData.length > 0 && (
  <div style={styles.chartsGrid}>
    <div style={styles.chartBox}>
      <h3 className="net-section-title">📡 방송 시청자 트렌드</h3>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <LineChart width={chartWidth} height={250} data={historyData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="time" stroke="#888" style={{ fontSize: '11px' }} />
          <YAxis stroke="#888" style={{ fontSize: '11px' }} />
          <Tooltip contentStyle={{ backgroundColor: '#222', borderColor: '#555' }} />
          <Legend />
          <Line type="monotone" dataKey="twitch" name="Twitch" stroke="#9146FF" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="chzzk" name="치지직" stroke="#00FFA3" strokeWidth={2} dot={false} />
        </LineChart>
      </div>
    </div>

    <div style={styles.chartBox}>
      <h3 className="net-section-title">👥 스팀 동접자 추이</h3>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <AreaChart width={chartWidth} height={250} data={historyData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="time" stroke="#888" style={{ fontSize: '11px' }} />
          <YAxis stroke="#888" style={{ fontSize: '11px' }} domain={['auto', 'auto']} />
          <Tooltip contentStyle={{ backgroundColor: '#222', borderColor: '#555' }} />
          <Area type="monotone" dataKey="steam" name="Steam 유저" stroke="#66c0f4" fill="#2a475e" />
        </AreaChart>
      </div>
    </div>
  </div>
)}

        <div style={styles.bottomGrid}>
          <div style={{ minWidth: 0 }}>
            <h3 className="net-section-title">가격 비교</h3>
            <div style={{ border: '1px solid #333', borderRadius: '8px', overflow: 'hidden' }}>
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
          <h3 className="net-section-title">👀 최근 본 게임</h3>
          <RecentGames currentSlug={gameData.slug} />
        </div>
      </div>
    </div>
  );
}
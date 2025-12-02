import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Skeleton from './Skeleton';
import { API_BASE_URL } from './config'; 

// ResponsiveContainer 제거 (오류 원인 방지), 직접 Chart 컴포넌트 사용
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

const REVIEW_KO_MAP = {
    "Overwhelmingly Positive": "압도적으로 긍정적",
    "Very Positive": "매우 긍정적",
    "Positive": "긍정적",
    "Mostly Positive": "대체로 긍정적",
    "Mixed": "복합적",
    "Mostly Negative": "대체로 부정적",
    "Negative": "부정적",
    "Very Negative": "매우 부정적",
    "Overwhelmingly Negative": "압도적으로 부정적",
    "정보 없음": "정보 없음"
};

const styles = {
  buyButton: { display: 'inline-block', padding: '12px 30px', backgroundColor: '#E50914', color: '#FFFFFF', textDecoration: 'none', borderRadius: '4px', fontSize: '18px', border: 'none', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' },
  wishlistButton: { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderWidth:'1px', borderStyle:'solid', borderColor:'#fff', borderRadius: '4px', fontWeight: 'bold' },
  wishlistButtonActive: { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#fff', color: '#000', borderWidth:'1px', borderStyle:'solid', borderColor:'#fff', borderRadius: '4px', fontWeight: 'bold' },
  thumbButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', borderWidth:'1px', borderStyle:'solid', borderColor:'#555', borderRadius: '4px', background: 'transparent', color: '#fff' },
  thumbButtonActive: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', borderWidth:'1px', borderStyle:'solid', borderColor:'#E50914', borderRadius: '4px', background: '#E50914', color: '#fff' },
  galleryContainer: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '40px' },
  mainMediaDisplay: { width: '100%', aspectRatio: '16 / 9', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '4px', overflow: 'hidden', border: '1px solid #333', position: 'relative' },
  mediaStrip: { display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', scrollBehavior: 'smooth' },
  thumbItem: { width: '120px', height: '68px', borderRadius: '2px', cursor: 'pointer', objectFit: 'cover', border: '2px solid transparent', opacity: 0.6, transition: 'all 0.2s' },
  thumbItemActive: { border: '2px solid #E50914', opacity: 1 },
  videoIconSmall: { position: 'absolute', bottom: '5px', left: '5px', fontSize: '12px', color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px 4px', borderRadius: '2px', pointerEvents: 'none' },
  playButtonOverlay: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '60px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', textShadow: '0 0 10px rgba(0,0,0,0.5)', zIndex: 10 },
  storeRowLink: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #333', backgroundColor: '#181818', textDecoration: 'none', color: '#fff', transition: 'background 0.2s', cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
  storeName: { fontWeight: 'bold', color: '#FFFFFF' },
  infoBadge: { display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: '4px', marginRight: '10px', fontWeight: 'bold', backgroundColor: '#333', color: '#fff', fontSize: '14px', cursor: 'help' },
  tooltip: { visibility: 'hidden', width: 'max-content', backgroundColor: 'rgba(0,0,0,0.9)', color: '#fff', textAlign: 'center', borderRadius: '4px', padding: '5px 10px', position: 'absolute', zIndex: '100', bottom: '125%', left: '50%', transform: 'translateX(-50%)', opacity: '0', transition: 'opacity 0.2s', fontSize: '12px', fontWeight: 'normal', border:'1px solid #555' },
  trendBadge: { display: 'inline-flex', alignItems: 'center', gap:'5px', padding: '6px 12px', borderRadius: '4px', marginRight: '10px', fontSize: '14px', fontWeight: 'bold', color:'#fff' },
  
  // 차트 그리드 레이아웃 (반응형 문제 해결을 위해 Flex 사용)
  chartsGrid: { display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '40px', justifyContent: 'center' },
  chartBox: { backgroundColor: '#181818', padding: '20px', borderRadius: '8px', border: '1px solid #333', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  
  reqTabButton: { flex: 1, padding: '10px', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: '2px solid #333', color: '#888', fontWeight: 'bold', fontSize: '16px' },
  reqTabButtonActive: { flex: 1, padding: '10px', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: '2px solid #E50914', color: '#fff', fontWeight: 'bold', fontSize: '16px' }
};

const InfoWithTooltip = ({ text, icon, tooltipText }) => {
    const [hover, setHover] = useState(false);
    return (
        <div style={{position:'relative', display:'inline-block'}} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <span style={styles.infoBadge}>{icon} {text}</span>
            <span style={{...styles.tooltip, visibility: hover ? 'visible' : 'hidden', opacity: hover ? 1 : 0}}>{tooltipText}</span>
        </div>
    );
};

function useCountdown(expiryTimestamp) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!expiryTimestamp) { setTimeLeft(null); return; }
    const intervalId = setInterval(() => {
      const now = new Date().getTime();
      const distance = new Date(expiryTimestamp).getTime() - now;
      if (distance < 0) { clearInterval(intervalId); setTimeLeft("종료됨"); }
      else {
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

function getReviewColor(summary) {
    if (!summary) return '#ccc';
    const koSummary = REVIEW_KO_MAP[summary] || summary;
    if (koSummary.includes('긍정적')) return '#66c0f4';
    if (koSummary.includes('부정적')) return '#a34c25';
    return '#b9a074';
}

function ShopPage({ region }) { 
  const { id } = useParams(); 
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
            } catch (e) { console.log("히스토리 없음"); }

            const videos = (data.trailers || []).map(url => ({ type: 'video', url: url, thumb: data.main_image }));
            const images = (data.screenshots || []).map(url => ({ type: 'image', url: url, thumb: url }));
            if(images.length === 0 && data.main_image) images.push({ type: 'image', url: data.main_image, thumb: data.main_image });

            const combinedList = [
                ...videos.slice(0, 2), 
                ...images, 
                ...videos.slice(2)
            ];
            
            setMediaList(combinedList);
            if (combinedList.length > 0) {
                setSelectedMedia(combinedList[0]);
                setIsPlaying(false);
            }

            const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
            setIsWishlisted(wishlist.includes(data.slug));
            setLikes(data.likes_count || 0);
            setDislikes(data.dislikes_count || 0);
            
            try {
                const ipRes = await axios.get(`${API_BASE_URL}/api/user/ip`);
                const myVoteData = data.votes?.find(v => v.identifier === ipRes.data.ip);
                if(myVoteData) setMyVote(myVoteData.type);
            } catch(e) {}

        } catch (err) { setLoading(false); }
    };
    fetchDetails();
  }, [id]); 

  const handleMediaSelect = (media) => { setSelectedMedia(media); setIsPlaying(false); };
  const handlePlayVideo = () => { setIsPlaying(true); if (videoRef.current) videoRef.current.play(); };

  const getPriceDisplay = (price, isFree) => {
    if (isFree) return "무료";
    if (price === null || price === undefined) return "가격 정보 없음";
    if (price === 0) return "가격 정보 확인 필요";
    return `₩${(Math.round(price / 10) * 10).toLocaleString()}`; 
  };

  const toggleWishlist = () => {
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    let newWishlist;
    if (isWishlisted) newWishlist = wishlist.filter(slug => slug !== gameData.slug);
    else newWishlist = [...wishlist, gameData.slug];
    localStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
    setIsWishlisted(!isWishlisted);
  };

  const handleVote = async (type) => {
      try {
        const response = await axios.post(`${API_BASE_URL}/api/games/${id}/vote`, { type });
        setLikes(response.data.likes);
        setDislikes(response.data.dislikes);
        setMyVote(response.data.userVote); 
      } catch (error) { alert("투표 실패"); }
  };

  const cleanHTML = (html) => DOMPurify.sanitize(html, { USE_PROFILES: { html: false } });
  const formatDate = (dateString) => {
      if (!dateString) return "정보 없음";
      const d = new Date(dateString);
      return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
  };

  const countdown = useCountdown(gameData?.price_info?.expiry);

  // ★ [핵심] 정규식을 사용하여 키워드 앞 줄바꿈 강제 적용 (텍스트 뭉침 해결)
  const formatRequirements = (html) => {
      if (!html || html === "정보 없음") return "정보 없음";
      
      let safeHtml = cleanHTML(html);

      // 1. 리스트 태그(ul, li)가 있는 경우 div로 변환 (기존 유지)
      safeHtml = safeHtml.replace(/<ul[^>]*>/g, '<div class="req-list">');
      safeHtml = safeHtml.replace(/<\/ul>/g, '</div>');
      safeHtml = safeHtml.replace(/<li[^>]*>/g, '<div class="req-item">');
      safeHtml = safeHtml.replace(/<\/li>/g, '</div>');
      
      // 2. [강력한 해결책] 키워드(운영체제, 프로세서 등)를 찾아 앞에서 줄바꿈(<br>) 강제
      // 한국어 및 영어 키워드 패턴 정의
      const keywordsPattern = /(운영\s*체제|프로세서|메모리|그래픽|저장\s*공간|DirectX|사운드\s*카드|네트워크|추가\s*사항|OS|Processor|Memory|Graphics|Storage|Network|Sound Card|Additional Notes)/gi;

      // 키워드 발견 시 줄바꿈(<br>) 후 강조 스타일(span.req-title) 적용
      safeHtml = safeHtml.replace(keywordsPattern, '<br><span class="req-title">$1</span>');
      
      // 3. 불필요한 태그 및 중복 줄바꿈 정리
      safeHtml = safeHtml.replace(/<br>\s*<br>/g, '<br>'); 
      if (safeHtml.startsWith('<br>')) {
          safeHtml = safeHtml.substring(4);
      }

      return safeHtml;
  };

  if (loading) return <div className="net-panel"><Skeleton height="500px" /></div>;
  if (!gameData) return <div className="net-panel net-empty">게임을 찾을 수 없습니다.</div>;

  const pi = gameData.price_info;
  const storeName = pi?.store_name || "스토어";
  const reviews = gameData.steam_reviews || {};
  const overall = reviews.overall || { summary: reviews.summary || "정보 없음", percent: 0, total: 0 };
  const recent = reviews.recent || { summary: "정보 없음", percent: 0, total: 0 };

  const renderStoreList = () => {
    const deals = pi?.deals || [];
    if (deals.length === 0 && pi) {
        return (
            <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.storeRowLink}>
                <span style={styles.storeName}>{storeName}</span>
                <span style={{color:'#46d369'}}>구매하러 가기 &gt;</span>
            </a>
        );
    }
    return deals.map((deal, idx) => (
        <a key={idx} href={deal.url} target="_blank" rel="noreferrer" style={styles.storeRowLink}>
            <div style={{display:'flex', alignItems:'center'}}>
                <span style={styles.storeName}>{deal.shopName}</span>
                {deal.discount > 0 && <span style={{marginLeft:'10px', color:'#E50914', fontSize:'12px', fontWeight:'bold'}}>-{deal.discount}%</span>}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                {deal.regularPrice > deal.price && <span style={{textDecoration:'line-through', color:'#888', fontSize:'12px'}}>{getPriceDisplay(deal.regularPrice, false)}</span>}
                <span style={{color:'#A24CD9', fontWeight:'bold'}}>{getPriceDisplay(deal.price, false)}</span>
                <span style={{fontSize:'12px', color:'#999'}}>&gt;</span>
            </div>
        </a>
    ));
  };

  return (
    <div>
      <div style={{
          position:'relative', height:'40vh', width:'100%', 
          backgroundImage:`url(${gameData.main_image})`, 
          backgroundSize:'cover', backgroundPosition:'center',
          filter: 'blur(20px) brightness(0.4)', 
          zIndex: 0
      }}></div>
      
      <div style={{
          position:'absolute', top: '100px', left:0, right:0, zIndex: 1,
          display:'flex', flexDirection:'column', alignItems:'center', padding:'0 4%'
      }}>
         <h1 style={{fontSize:'48px', marginBottom:'20px', textShadow:'2px 2px 4px rgba(0,0,0,0.8)', textAlign:'center'}}>
            {gameData.title_ko || gameData.title}
         </h1>

         <div style={{display:'flex', gap:'10px', marginBottom:'30px'}}>
            {gameData.steam_ccu > 0 && (
                <span style={{...styles.trendBadge, backgroundColor:'#2a475e', border:'1px solid #66c0f4'}}>
                    👥 Steam {gameData.steam_ccu.toLocaleString()}명
                </span>
            )}
            {(gameData.twitch_viewers + gameData.chzzk_viewers) > 0 && (
                <span style={{...styles.trendBadge, backgroundColor:'#9146FF'}}>
                    📺 Live {(gameData.twitch_viewers + gameData.chzzk_viewers).toLocaleString()}명
                </span>
            )}
         </div>
      </div>

      <div className="net-panel" style={{position:'relative', marginTop:'-10vh', zIndex: 2}}>
        
        <div style={styles.galleryContainer}>
            <div style={styles.mainMediaDisplay}>
                {selectedMedia?.type === 'video' ? (
                    <>
                        <video ref={videoRef} src={selectedMedia.url} controls={isPlaying} muted={false} playsInline style={{width:'100%', height:'100%', objectFit:'contain', display: isPlaying ? 'block' : 'none'}} />
                        {!isPlaying && (
                            <>
                                <img src={selectedMedia.thumb} alt="Trailer Poster" style={{width:'100%', height:'100%', objectFit:'cover', opacity:0.7}} />
                                <div style={styles.playButtonOverlay} onClick={handlePlayVideo}>▶</div>
                            </>
                        )}
                    </>
                ) : (
                    <img src={selectedMedia?.url} alt="Main View" style={{width:'100%', height:'100%', objectFit:'contain'}} />
                )}
            </div>
            <div style={styles.mediaStrip}>
                {mediaList.map((item, idx) => (
                    <div key={idx} style={{position:'relative', flexShrink:0}} onClick={() => handleMediaSelect(item)}>
                        <img src={item.thumb} alt={`thumb-${idx}`} style={{...styles.thumbItem, ...(selectedMedia?.url === item.url ? styles.thumbItemActive : {})}} />
                        {item.type === 'video' && <div style={styles.videoIconSmall}>▶ Video</div>}
                    </div>
                ))}
            </div>
        </div>

        <div style={{display:'flex', gap:'10px', marginBottom:'40px', flexWrap:'wrap', alignItems:'center'}}>
            <InfoWithTooltip text={`📅 ${formatDate(gameData.releaseDate)}`} tooltipText="출시일" icon="" />
            {gameData.metacritic_score > 0 && <InfoWithTooltip text={`Metacritic ${gameData.metacritic_score}`} tooltipText="전문가 평점 (메타크리틱)" icon="Ⓜ️" />}
            <InfoWithTooltip text={gameData.play_time !== "정보 없음" ? `⏳ ${gameData.play_time}` : "⏳ 시간 정보 없음"} tooltipText="플레이 타임" icon="" />
            
            <div style={{display:'flex', flexDirection:'column', gap:'5px', minWidth:'250px', marginLeft:'10px', paddingLeft:'10px', borderLeft:'1px solid #444'}}>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#aaa'}}>
                    <span>모든 평가 ({overall.total.toLocaleString()})</span>
                    <span style={{color: getReviewColor(overall.summary), fontWeight:'bold'}}>
                        {REVIEW_KO_MAP[overall.summary] || overall.summary}
                    </span>
                </div>
                {recent.total > 0 ? (
                    <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#aaa'}}>
                        <span>최근 평가 ({recent.total.toLocaleString()})</span>
                        <span style={{color: getReviewColor(recent.summary), fontWeight:'bold'}}>
                            {REVIEW_KO_MAP[recent.summary] || recent.summary}
                        </span>
                    </div>
                ) : (
                    <div style={{fontSize:'12px', color:'#555', marginTop:'2px'}}>최근 평가 데이터 없음</div>
                )}
            </div>
        </div>

        <div style={{display:'flex', gap:'15px', alignItems:'center', marginBottom:'40px'}}>
             {pi && <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>{getPriceDisplay(pi.current_price, pi.isFree)} 구매하기</a>}
             <button style={isWishlisted ? styles.wishlistButtonActive : styles.wishlistButton} onClick={toggleWishlist}>{isWishlisted ? '✔ 찜함' : '+ 찜하기'}</button>
             <button style={myVote === 'like' ? styles.thumbButtonActive : styles.thumbButton} onClick={() => handleVote('like')}>👍 {likes}</button>
             <button style={myVote === 'dislike' ? styles.thumbButtonActive : styles.thumbButton} onClick={() => handleVote('dislike')}>👎 {dislikes}</button>
        </div>

        {pi?.discount_percent > 0 && countdown && (
            <div style={{color:'#E50914', fontWeight:'bold', fontSize:'16px', marginBottom:'40px'}}>
                🔥 특가 할인 중! (남은 시간: {countdown})
            </div>
        )}

        {historyData.length > 0 && (
            <div style={styles.chartsGrid}>
                {/* ★ [차트] ResponsiveContainer 제거하고 고정 크기 사용 (오류 원천 차단) */}
                <div style={styles.chartBox}>
                    <h3 className="net-section-title">📡 방송 시청자 트렌드</h3>
                    <div style={{ width: '500px', height: '250px', overflowX: 'auto', overflowY:'hidden' }}> 
                        <LineChart width={500} height={250} data={historyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="time" stroke="#888" style={{fontSize:'11px'}} />
                            <YAxis stroke="#888" style={{fontSize:'11px'}} />
                            <Tooltip contentStyle={{backgroundColor:'#222', borderColor:'#555'}} />
                            <Legend />
                            <Line type="monotone" dataKey="twitch" name="Twitch" stroke="#9146FF" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="chzzk" name="치지직" stroke="#00FFA3" strokeWidth={2} dot={false} />
                        </LineChart>
                    </div>
                </div>

                <div style={styles.chartBox}>
                    <h3 className="net-section-title">👥 스팀 동접자 추이</h3>
                    <div style={{ width: '500px', height: '250px', overflowX: 'auto', overflowY:'hidden' }}>
                        <AreaChart width={500} height={250} data={historyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="time" stroke="#888" style={{fontSize:'11px'}} />
                            <YAxis stroke="#888" style={{fontSize:'11px'}} domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{backgroundColor:'#222', borderColor:'#555'}} />
                            <Area type="monotone" dataKey="steam" name="Steam 유저" stroke="#66c0f4" fill="#2a475e" />
                        </AreaChart>
                    </div>
                </div>
            </div>
        )}

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'40px', marginTop:'40px'}}>
            <div>
                <h3 className="net-section-title">가격 비교</h3>
                <div style={{border:'1px solid #333', borderRadius:'8px', overflow:'hidden'}}>{renderStoreList()}</div>
            </div>
            
            <div>
                <h3 className="net-section-title">시스템 요구 사항</h3>
                <div style={{display:'flex', marginBottom:'15px', borderBottom:'1px solid #333'}}>
                    <button onClick={() => setReqTab('minimum')} style={reqTab === 'minimum' ? styles.reqTabButtonActive : styles.reqTabButton}>최소 사양</button>
                    <button onClick={() => setReqTab('recommended')} style={reqTab === 'recommended' ? styles.reqTabButtonActive : styles.reqTabButton}>권장 사양</button>
                </div>
                
                {/* ★ [CSS 주입] 사양 정보 스타일 수정 */}
                <style>{`
                    .req-content {
                        font-size: 14px;
                        line-height: 1.6;
                        color: #acb2b8;
                    }
                    .req-content .req-list { margin-top: 10px; }
                    
                    /* 각 항목이 블록으로 잡히도록 설정 */
                    .req-content .req-item { 
                        margin-bottom: 8px; 
                        display: block; 
                    }
                    
                    /* ★ [디자인] 항목 제목 (예: 운영체제, 그래픽 등) 스타일 */
                    .req-content .req-title { 
                        color: #66c0f4; /* 스팀 스타일 하늘색 */
                        font-weight: bold; 
                        margin-right: 6px; 
                        display: inline-block;
                        margin-top: 5px;
                    }
                    
                    /* 줄바꿈 태그가 확실히 작동하고 간격을 갖도록 설정 */
                    .req-content br { 
                        display: block; 
                        content: ""; 
                        margin-bottom: 6px; 
                    }
                    
                    /* 리스트 태그 초기화 */
                    .req-content ul { padding: 0; margin: 0; list-style: none; }
                    .req-content li { margin-bottom: 8px; display: block; }
                `}</style>

                <div className="req-content" style={{minHeight:'200px'}}>
                    {reqTab === 'minimum' ? (
                         <div dangerouslySetInnerHTML={{ __html: formatRequirements(gameData.pc_requirements?.minimum) }} />
                    ) : (
                         <div dangerouslySetInnerHTML={{ __html: formatRequirements(gameData.pc_requirements?.recommended) }} />
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
export default ShopPage;
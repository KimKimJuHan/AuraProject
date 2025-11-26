import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Skeleton from './Skeleton';

const styles = {
  // ... (기존 버튼 스타일 유지) ...
  buyButton: { display: 'inline-block', padding: '12px 30px', backgroundColor: '#E50914', color: '#FFFFFF', textDecoration: 'none', borderRadius: '4px', fontSize: '18px', border: 'none', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' },
  wishlistButton: { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderWidth:'1px', borderStyle:'solid', borderColor:'#fff', borderRadius: '4px', fontWeight: 'bold' },
  wishlistButtonActive: { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#fff', color: '#000', borderWidth:'1px', borderStyle:'solid', borderColor:'#fff', borderRadius: '4px', fontWeight: 'bold' },
  thumbButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', borderWidth:'1px', borderStyle:'solid', borderColor:'#555', borderRadius: '4px', background: 'transparent', color: '#fff' },
  thumbButtonActive: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', borderWidth:'1px', borderStyle:'solid', borderColor:'#E50914', borderRadius: '4px', background: '#E50914', color: '#fff' },
  
  // ★ 미디어 갤러리 스타일 (스팀 스타일) ★
  galleryContainer: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '40px' },
  mainMediaDisplay: { 
    width: '100%', 
    aspectRatio: '16 / 9', // 16:9 비율 고정
    backgroundColor: '#000', 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid #333',
    position: 'relative' // 재생 버튼 오버레이를 위해
  },
  mediaStrip: { 
    display: 'flex', 
    gap: '8px', 
    overflowX: 'auto', 
    paddingBottom: '10px',
    scrollBehavior: 'smooth'
  },
  thumbItem: { 
    width: '120px', 
    height: '68px', // 16:9 비율 썸네일
    borderRadius: '2px', 
    cursor: 'pointer', 
    objectFit: 'cover',
    border: '2px solid transparent',
    opacity: 0.6,
    transition: 'all 0.2s'
  },
  thumbItemActive: { 
    border: '2px solid #E50914', // 선택된 항목 강조
    opacity: 1 
  },
  // 썸네일 위 영상 아이콘 (작게)
  videoIconSmall: {
    position: 'absolute',
    bottom: '5px',
    left: '5px',
    fontSize: '12px',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '2px 4px',
    borderRadius: '2px',
    pointerEvents: 'none'
  },
  // 메인 화면 재생 버튼 (크게)
  playButtonOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '60px',
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    textShadow: '0 0 10px rgba(0,0,0,0.5)',
    zIndex: 10
  },

  // ... (기타 스타일 유지) ...
  storeRowLink: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #333', backgroundColor: '#181818', textDecoration: 'none', color: '#fff', transition: 'background 0.2s', cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
  storeName: { fontWeight: 'bold', color: '#FFFFFF' },
  infoBadge: { display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: '4px', marginRight: '10px', fontWeight: 'bold', backgroundColor: '#333', color: '#fff', fontSize: '14px', cursor: 'help' },
  tooltip: { visibility: 'hidden', width: 'max-content', backgroundColor: 'rgba(0,0,0,0.9)', color: '#fff', textAlign: 'center', borderRadius: '4px', padding: '5px 10px', position: 'absolute', zIndex: '100', bottom: '125%', left: '50%', transform: 'translateX(-50%)', opacity: '0', transition: 'opacity 0.2s', fontSize: '12px', fontWeight: 'normal', border:'1px solid #555' },
  trendBadge: { display: 'inline-flex', alignItems: 'center', gap:'5px', padding: '6px 12px', borderRadius: '4px', marginRight: '10px', fontSize: '14px', fontWeight: 'bold', color:'#fff' }
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

function ShopPage({ region }) { 
  const { id } = useParams(); 
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [mediaList, setMediaList] = useState([]); 
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [myVote, setMyVote] = useState(null);
  
  // 동영상 자동 재생 방지용 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const fetchDetails = async () => {
        try {
            const res = await axios.get(`http://localhost:8000/api/games/${id}`);
            const data = res.data;
            setGameData(data);
            setLoading(false);

            // ★ 미디어 리스트 구성 (영상 2개 -> 이미지 -> 나머지 영상) ★
            const videos = [];
            if (data.trailers && data.trailers.length > 0) {
                data.trailers.forEach(url => {
                     // 스팀 영상은 poster 이미지가 따로 없으므로 메인 이미지 사용 (또는 영상 자체 썸네일 API 활용 필요)
                     // 여기서는 메인 이미지를 임시 썸네일로 사용
                     videos.push({ type: 'video', url: url, thumb: data.main_image }); 
                });
            }

            const images = [];
            if (data.screenshots && data.screenshots.length > 0) {
                data.screenshots.forEach(url => {
                    images.push({ type: 'image', url: url, thumb: url });
                });
            } else if (data.main_image) {
                images.push({ type: 'image', url: data.main_image, thumb: data.main_image });
            }

            // 순서: 영상(최대 2개) -> 이미지들 -> 나머지 영상들
            const firstVideos = videos.slice(0, 2);
            const remainingVideos = videos.slice(2);
            const combinedList = [...firstVideos, ...images, ...remainingVideos];

            setMediaList(combinedList);
            
            // 초기 선택: 첫 번째 미디어 (자동 재생 X)
            if (combinedList.length > 0) {
                setSelectedMedia(combinedList[0]);
                setIsPlaying(false); // 처음에 재생 안 함
            }

            const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
            setIsWishlisted(wishlist.includes(data.slug));
            setLikes(data.likes_count || 0);
            setDislikes(data.dislikes_count || 0);
            
            try {
                const ipRes = await axios.get('http://localhost:8000/api/user/ip');
                const myVoteData = data.votes?.find(v => v.identifier === ipRes.data.ip);
                if(myVoteData) setMyVote(myVoteData.type);
            } catch(e) {}

        } catch (err) { setLoading(false); }
    };
    fetchDetails();
  }, [id]); 

  // 미디어 선택 시 처리 (영상은 자동 재생 안 함)
  const handleMediaSelect = (media) => {
      setSelectedMedia(media);
      setIsPlaying(false); // 영상 선택 시 일단 멈춤 상태로 시작
  };

  // 재생 버튼 클릭 시
  const handlePlayVideo = () => {
      setIsPlaying(true);
      if (videoRef.current) {
          videoRef.current.play();
      }
  };

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
        const response = await axios.post(`http://localhost:8000/api/games/${id}/vote`, { type });
        const data = response.data;
        setLikes(data.likes);
        setDislikes(data.dislikes);
        setMyVote(data.userVote); 
      } catch (error) { alert("투표 실패"); }
  };

  const cleanHTML = (html) => { return DOMPurify.sanitize(html, { USE_PROFILES: { html: false } }); };
  const formatDate = (dateString) => {
      if (!dateString) return "정보 없음";
      const d = new Date(dateString);
      return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
  };

  const countdown = useCountdown(gameData?.price_info?.expiry);

  if (loading) return <div className="net-panel"><Skeleton height="500px" /></div>;
  if (!gameData) return <div className="net-panel net-empty">게임을 찾을 수 없습니다.</div>;

  const pi = gameData.price_info;
  const storeName = pi?.store_name || "스토어";

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
      {/* 상단 배너 배경 */}
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
            {gameData.twitch_viewers > 0 && (
                <span style={{...styles.trendBadge, backgroundColor:'#9146FF'}}>
                    💜 Twitch {gameData.twitch_viewers.toLocaleString()}명
                </span>
            )}
            {gameData.chzzk_viewers > 0 && (
                <span style={{...styles.trendBadge, backgroundColor:'#00FFA3', color:'#000'}}>
                    💚 치지직 {gameData.chzzk_viewers.toLocaleString()}명
                </span>
            )}
         </div>
      </div>

      <div className="net-panel" style={{position:'relative', marginTop:'-10vh', zIndex: 2}}>
        
        {/* ★ 미디어 갤러리 ★ */}
        <div style={styles.galleryContainer}>
            {/* 메인 뷰어 */}
            <div style={styles.mainMediaDisplay}>
                {selectedMedia?.type === 'video' ? (
                    <>
                        {/* 영상 요소 (초기엔 포스터만 보이고, 재생 시 영상 로드) */}
                        <video 
                            ref={videoRef}
                            src={selectedMedia.url} 
                            controls={isPlaying} // 재생 중에만 컨트롤 표시
                            muted={false} 
                            style={{width:'100%', height:'100%', objectFit:'contain', display: isPlaying ? 'block' : 'none'}}
                        >
                            브라우저가 영상을 지원하지 않습니다.
                        </video>
                        
                        {/* 재생 전 포스터 & 재생 버튼 */}
                        {!isPlaying && (
                            <>
                                <img 
                                    src={selectedMedia.thumb} 
                                    alt="Trailer Poster" 
                                    style={{width:'100%', height:'100%', objectFit:'cover', opacity:0.7}} 
                                />
                                <div style={styles.playButtonOverlay} onClick={handlePlayVideo}>
                                    ▶
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <img src={selectedMedia?.url} alt="Main View" style={{width:'100%', height:'100%', objectFit:'contain'}} />
                )}
            </div>

            {/* 썸네일 스트립 */}
            <div style={styles.mediaStrip}>
                {mediaList.map((item, idx) => (
                    <div 
                        key={idx} 
                        style={{position:'relative', flexShrink:0}} 
                        onClick={() => handleMediaSelect(item)}
                    >
                        <img 
                            src={item.thumb} 
                            alt={`thumb-${idx}`} 
                            style={{
                                ...styles.thumbItem,
                                ...(selectedMedia?.url === item.url ? styles.thumbItemActive : {})
                            }} 
                        />
                        {/* 영상이면 작은 아이콘 표시 */}
                        {item.type === 'video' && (
                            <div style={styles.videoIconSmall}>▶ Video</div>
                        )}
                    </div>
                ))}
            </div>
        </div>

        {/* ... (하단 정보 섹션은 기존 유지) ... */}
        <div style={{display:'flex', gap:'10px', marginBottom:'40px', flexWrap:'wrap'}}>
            <InfoWithTooltip text={`📅 ${formatDate(gameData.releaseDate)}`} tooltipText="출시일" icon="" />
            {gameData.metacritic_score > 0 && <InfoWithTooltip text={`Metacritic ${gameData.metacritic_score}`} tooltipText="전문가 평점" icon="Ⓜ️" />}
            <InfoWithTooltip text={gameData.play_time !== "정보 없음" ? `⏳ ${gameData.play_time}` : "⏳ 시간 정보 없음"} tooltipText="플레이 타임" icon="" />
        </div>

        <div style={{display:'flex', gap:'15px', alignItems:'center', marginBottom:'40px'}}>
             {pi && (
                <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>
                    {getPriceDisplay(pi.current_price, pi.isFree)} 구매하기
                </a>
             )}
             <button style={isWishlisted ? styles.wishlistButtonActive : styles.wishlistButton} onClick={toggleWishlist}>{isWishlisted ? '✔ 찜함' : '+ 찜하기'}</button>
             <button style={myVote === 'like' ? styles.thumbButtonActive : styles.thumbButton} onClick={() => handleVote('like')}>👍 {likes}</button>
             <button style={myVote === 'dislike' ? styles.thumbButtonActive : styles.thumbButton} onClick={() => handleVote('dislike')}>👎 {dislikes}</button>
        </div>
        
        {pi?.discount_percent > 0 && countdown && (
            <div style={{color:'#E50914', fontWeight:'bold', fontSize:'16px', marginBottom:'40px'}}>
                🔥 특가 할인 중! (남은 시간: {countdown})
            </div>
        )}

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'40px'}}>
            <div>
                <h3 className="net-section-title">가격 비교</h3>
                <div style={{border:'1px solid #333', borderRadius:'8px', overflow:'hidden'}}>
                    {renderStoreList()}
                </div>
            </div>

            <div>
                <h3 className="net-section-title">시스템 요구 사항</h3>
                <div style={{fontSize:'14px', lineHeight:'1.6', color:'#ccc'}}>
                    <strong style={{color:'#fff', display:'block', marginBottom:'10px'}}>최소 사양</strong>
                    <div dangerouslySetInnerHTML={{ __html: cleanHTML(gameData.pc_requirements?.minimum || "정보 없음") }} />
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
export default ShopPage;
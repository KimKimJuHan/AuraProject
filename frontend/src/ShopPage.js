import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Skeleton from './Skeleton';

const styles = {
  buyButton: { display: 'inline-block', padding: '12px 30px', backgroundColor: '#E50914', color: '#FFFFFF', textDecoration: 'none', borderRadius: '4px', fontSize: '18px', border: 'none', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' },
  wishlistButton: { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid #fff', borderRadius: '4px', fontWeight: 'bold' },
  wishlistButtonActive: { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#fff', color: '#000', border: '1px solid #fff', borderRadius: '4px', fontWeight: 'bold' },
  thumbButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', border: '1px solid #555', borderRadius: '4px', background: 'transparent', color: '#fff' },
  thumbButtonActive: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', border: '1px solid #E50914', borderRadius: '4px', background: '#E50914', color: '#fff' },
  
  mediaContainer: { display: 'flex', overflowX: 'auto', padding: '20px 0', gap:'10px' },
  mediaItem: { height: '100px', borderRadius: '4px', border: '2px solid transparent', cursor: 'pointer', transition:'border 0.2s' },
  mainMediaDisplay: { width: '100%', maxWidth: '100%', height: 'auto', maxHeight:'500px', marginBottom: '10px', borderRadius: '4px', backgroundColor: '#000', display: 'flex', justifyContent: 'center', objectFit:'contain' },
  storeRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #333', backgroundColor: '#181818' },
  storeName: { fontWeight: 'bold', color: '#FFFFFF' },
  storePrice: { color: '#A24CD9', fontWeight: 'bold' },
  storeLink: { color: '#b3b3b3', textDecoration: 'none', border: '1px solid #b3b3b3', padding: '2px 8px', borderRadius: '4px', fontSize:'12px' },
  
  infoBadge: { display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: '4px', marginRight: '10px', fontWeight: 'bold', backgroundColor: '#333', color: '#fff', fontSize: '14px', cursor: 'help' },
  tooltip: { visibility: 'hidden', width: 'max-content', backgroundColor: 'rgba(0,0,0,0.9)', color: '#fff', textAlign: 'center', borderRadius: '4px', padding: '5px 10px', position: 'absolute', zIndex: '100', bottom: '125%', left: '50%', transform: 'translateX(-50%)', opacity: '0', transition: 'opacity 0.2s', fontSize: '12px', fontWeight: 'normal', border:'1px solid #555' }
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
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [myVote, setMyVote] = useState(null); 

  useEffect(() => {
    fetch(`http://localhost:8000/api/games/${id}`)
      .then(res => res.json())
      .then(data => {
        setGameData(data);
        setLoading(false);
        if (data.main_image) setSelectedMedia({ type: 'image', url: data.main_image });
        const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
        setIsWishlisted(wishlist.includes(data.slug));
        setLikes(data.likes_count || 0);
        setDislikes(data.dislikes_count || 0);
      })
      .catch(() => setLoading(false));
  }, [id]); 

  const getPriceDisplay = (price) => {
    if (price === null) return "정보 없음";
    if (region === 'US') return `$${(price / 1400).toFixed(2)}`; 
    if (region === 'JP') return `¥${(price / 9).toFixed(0)}`;    
    return `₩${price.toLocaleString()}`; 
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
        const response = await fetch(`http://localhost:8000/api/games/${id}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        });
        const data = await response.json();
        setLikes(data.likes);
        setDislikes(data.dislikes);
        setMyVote(data.userVote); 
      } catch (error) { console.error(error); }
  };

  const countdown = useCountdown(gameData?.price_info?.expiry);

  if (loading) return <div className="net-panel"><Skeleton height="500px" /></div>;
  if (!gameData) return <div className="net-panel net-empty">게임을 찾을 수 없습니다.</div>;

  const allMedia = [];
  if(gameData.main_image) allMedia.push({type:'image', url:gameData.main_image});
  gameData.trailers?.forEach(url => allMedia.push({type:'video', url}));
  gameData.screenshots?.forEach(url => { if(url !== gameData.main_image) allMedia.push({type:'image', url}); });
  const uniqueMedia = Array.from(new Set(allMedia.map(JSON.stringify))).map(JSON.parse);

  const pi = gameData.price_info;
  const storeName = pi?.store_name || "스토어";

  const formatDate = (dateString) => {
      if (!dateString) return "정보 없음";
      const d = new Date(dateString);
      return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
  };

  const renderStoreList = () => {
    const deals = pi?.deals || [];
    if (deals.length === 0 && pi) {
        return (
            <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.storeRowLink} className="store-row-hover">
                <span style={styles.storeName}>{pi.store_name}</span>
                <span style={{color:'#46d369'}}>구매하러 가기 &gt;</span>
            </a>
        );
    }
    return deals.map((deal, idx) => (
        <a key={idx} href={deal.url} target="_blank" rel="noreferrer" style={styles.storeRowLink} className="store-row-hover">
            <div style={{display:'flex', alignItems:'center'}}>
                <span style={styles.storeName}>{deal.shopName}</span>
                {deal.discount > 0 && <span style={{marginLeft:'10px', color:'#E50914', fontSize:'12px', fontWeight:'bold'}}>-{deal.discount}%</span>}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                {deal.regularPrice > deal.price && <span style={{textDecoration:'line-through', color:'#888', fontSize:'12px'}}>{getPriceDisplay(deal.regularPrice)}</span>}
                <span style={{color:'#A24CD9', fontWeight:'bold'}}>{getPriceDisplay(deal.price)}</span>
                <span style={{fontSize:'12px', color:'#999'}}>&gt;</span>
            </div>
        </a>
    ));
  };

  return (
    <div>
      <div style={{position:'relative', height:'75vh', width:'100%', backgroundImage:`url(${gameData.screenshots?.[0] || gameData.main_image})`, backgroundSize:'cover', backgroundPosition:'center'}}>
         <div style={{position:'absolute', inset:0, background:'linear-gradient(to top, #141414, transparent 80%)'}}></div>
         <div style={{position:'absolute', bottom:'50px', left:'4%', maxWidth:'800px', textShadow:'2px 2px 4px rgba(0,0,0,0.8)'}}>
            
            <h1 style={{fontSize:'50px', marginBottom:'15px', lineHeight:'1.1'}}>{gameData.title_ko || gameData.title}</h1>
            
            <div style={{display:'flex', gap:'10px', marginBottom:'20px', flexWrap:'wrap'}}>
                <InfoWithTooltip text={`📅 ${formatDate(gameData.releaseDate)}`} tooltipText="게임 출시일" icon="" />
                {gameData.metacritic_score > 0 && <InfoWithTooltip text={`Metacritic ${gameData.metacritic_score}`} tooltipText="전문가 평점" icon="Ⓜ️" />}
                <InfoWithTooltip text={gameData.play_time !== "정보 없음" ? `⏳ ${gameData.play_time}` : "⏳ 플레이 타임 정보 없음"} tooltipText="메인 스토리 클리어 평균 시간 (HLTB)" icon="" />
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                    {pi && (
                        <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>
                            {pi.isFree ? "무료 플레이" : (pi.regular_price !== null ? `구매하기 ${getPriceDisplay(pi.current_price)}` : `${storeName} 확인`)}
                        </a>
                    )}
                    <button style={isWishlisted ? styles.wishlistButtonActive : styles.wishlistButton} onClick={toggleWishlist}>
                        {isWishlisted ? '✔ 찜함' : '+ 찜하기'}
                    </button>
                    <button style={myVote === 'like' ? styles.thumbButtonActive : styles.thumbButton} onClick={() => handleVote('like')}>👍 {likes}</button>
                    <button style={myVote === 'dislike' ? styles.thumbButtonActive : styles.thumbButton} onClick={() => handleVote('dislike')}>👎 {dislikes}</button>
                </div>

                {/* ★ [수정] 할인 중 + 타이머가 있을 때만 표시 */}
                {pi?.discount_percent > 0 && countdown && (
                    <div style={{color:'#E50914', fontWeight:'bold', fontSize:'15px', display:'flex', alignItems:'center', gap:'5px', background:'rgba(0,0,0,0.6)', padding:'5px 10px', borderRadius:'4px', width:'fit-content'}}>
                        <span>🔥 특가 할인 중!</span>
                        <span>(⏰ 남은 시간: {countdown})</span>
                    </div>
                )}
            </div>
         </div>
      </div>

      <div className="net-panel">
        <h3 className="net-section-title">스크린샷 & 트레일러</h3>
        {selectedMedia && (
            selectedMedia.type === 'video' 
            ? <video controls autoPlay src={selectedMedia.url} style={styles.mainMediaDisplay} />
            : <img src={selectedMedia.url} alt="Main" style={styles.mainMediaDisplay} />
        )}
        <div style={styles.mediaContainer}>
            {uniqueMedia.map((m, i) => (
                <img key={i} src={m.type==='video'? gameData.main_image : m.url} alt="thumb" 
                     style={{...styles.mediaItem, borderColor: selectedMedia?.url === m.url ? '#E50914' : 'transparent'}} 
                     onClick={() => setSelectedMedia(m)} />
            ))}
        </div>

        <h3 className="net-section-title" style={{marginTop:'40px'}}>가격 비교</h3>
        <div style={{border:'1px solid #333', borderRadius:'8px', overflow:'hidden'}}>
            {renderStoreList()}
        </div>

        <h3 className="net-section-title" style={{marginTop:'40px'}}>시스템 요구 사항</h3>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'40px', color:'#ccc', fontSize:'14px', lineHeight:'1.6'}}>
            <div>
                <strong style={{color:'#fff', display:'block', marginBottom:'10px'}}>최소 사양</strong>
                <div dangerouslySetInnerHTML={{ __html: gameData.pc_requirements?.minimum || "정보 없음" }} />
            </div>
            <div>
                <strong style={{color:'#fff', display:'block', marginBottom:'10px'}}>권장 사양</strong>
                <div dangerouslySetInnerHTML={{ __html: gameData.pc_requirements?.recommended || "권장 사양 정보 없음" }} />
            </div>
        </div>
      </div>
    </div>
  );
}
export default ShopPage;
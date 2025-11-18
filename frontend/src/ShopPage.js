import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Skeleton from './Skeleton'; // ★ 스켈레톤 추가

const styles = {
  buyButton: { display: 'inline-block', padding: '10px 15px', backgroundColor: '#3D46F2', color: '#FFFFFF', textDecoration: 'none', borderRadius: '999px', fontSize: '16px', border: 'none', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.7)' },
  tagButton: { margin: '4px', padding: '5px 10px', backgroundColor: '#A24CD9', color: '#011526', borderRadius: '999px', fontSize: '14px', border: 'none' },
  specBox: { backgroundColor: '#021E73', padding: '15px', lineHeight: '1.6', borderRadius: '8px', color: '#FFFFFF', boxShadow: '0 4px 12px rgba(0,0,0,0.6)' },
  wishlistButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#A24CD9', color: '#011526', border: 'none', borderRadius: '999px', fontWeight: 'bold' },
  wishlistButtonActive: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#D94F4C', color: '#FFFFFF', border: 'none', borderRadius: '999px', fontWeight: 'bold' },
  thumbButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', border: '1px solid #3D46F2', borderRadius: '999px', background: '#021E73', color: '#FFFFFF', transition: '0.2s' },
  thumbButtonActive: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', border: '1px solid #3D46F2', borderRadius: '999px', background: '#3D46F2', color: '#FFFFFF' },
  mediaContainer: { display: 'flex', overflowX: 'auto', padding: '10px 0', backgroundColor: '#011526' },
  mediaItem: { height: '100px', marginRight: '10px', borderRadius: '8px', border: '1px solid #3D46F2', cursor: 'pointer' },
  mainMediaDisplay: { width: '100%', maxWidth: '100%', height: 'auto', marginBottom: '10px', borderRadius: '8px', border: '1px solid #3D46F2', backgroundColor: '#000', display: 'flex', justifyContent: 'center' },
  storeRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #3D46F2', backgroundColor: '#021E73' },
  storeName: { fontWeight: 'bold', color: '#FFFFFF' },
  storePrice: { color: '#A24CD9', fontWeight: 'bold' },
  storeLink: { color: '#D494D9', textDecoration: 'none', border: '1px solid #D494D9', padding: '2px 8px', borderRadius: '4px' },
  infoBadge: { display: 'inline-block', padding: '5px 10px', borderRadius: '5px', marginRight: '10px', fontWeight: 'bold', backgroundColor: '#3D46F2', color: 'white', fontSize: '14px', position: 'relative', cursor: 'help' },
  tooltip: { visibility: 'hidden', width: '200px', backgroundColor: '#333', color: '#fff', textAlign: 'center', borderRadius: '6px', padding: '5px', position: 'absolute', zIndex: '1', bottom: '125%', left: '50%', marginLeft: '-100px', opacity: '0', transition: 'opacity 0.3s', fontSize: '12px', fontWeight: 'normal' }
};

const InfoWithTooltip = ({ text, color, tooltipText, icon }) => {
    const [hover, setHover] = useState(false);
    return (
        <span style={{...styles.infoBadge, backgroundColor: color}} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {icon} {text}
            <span style={{...styles.tooltip, visibility: hover ? 'visible' : 'hidden', opacity: hover ? 1 : 0}}>{tooltipText}</span>
        </span>
    );
};

function useCountdown(expiryTimestamp) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!expiryTimestamp) { setTimeLeft(null); return; }
    const intervalId = setInterval(() => {
      const now = new Date().getTime();
      const distance = new Date(expiryTimestamp).getTime() - now;
      if (distance < 0) { clearInterval(intervalId); setTimeLeft("할인 종료"); }
      else {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        setTimeLeft(`${days}일 ${hours}시간`);
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
        if (data.error) throw new Error(data.error);
        setGameData(data);
        setLoading(false);
        if (data.main_image) setSelectedMedia({ type: 'image', url: data.main_image });
        const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
        setIsWishlisted(wishlist.includes(data.slug));
        setLikes(data.likes_count || 0);
        setDislikes(data.dislikes_count || 0);
      })
      .catch(err => console.error(err));
  }, [id]); 

  const getPriceDisplay = (price) => {
    if (price === null || price === undefined) return "가격 정보 없음";
    if (region === 'US') return `$${(price / 1400).toFixed(2)}`; 
    if (region === 'JP') return `¥${(price / 9).toFixed(0)}`;    
    return `${price.toLocaleString()}원`; 
  };

  const toggleWishlist = () => {
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    let newWishlist;
    if (isWishlisted) {
        newWishlist = wishlist.filter(slug => slug !== gameData.slug);
    } else {
        newWishlist = [...wishlist, gameData.slug];
    }
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
      } catch (error) {
          console.error("투표 실패:", error);
      }
  };

  const countdown = useCountdown(gameData?.price_info?.expiry);

  // ★ [수정] 상세 페이지 스켈레톤 로딩
  if (loading) {
      return (
          <div style={{ padding: '20px', maxWidth: '800px', margin: 'auto', backgroundColor: '#011526', color: 'white' }}>
            <Skeleton width="50%" height="40px" style={{marginBottom: '20px'}} /> {/* 제목 */}
            <Skeleton width="100%" height="450px" style={{marginBottom: '20px'}} /> {/* 미디어 */}
            <Skeleton width="100%" height="100px" style={{marginBottom: '20px'}} /> {/* 가격 */}
            <Skeleton width="100%" height="200px" /> {/* 설명 */}
          </div>
      );
  }

  if (!gameData) return <div style={{padding:'20px', color:'white'}}>데이터 없음!</div>;

  const handleImageError = (e) => { e.target.src = "https://via.placeholder.com/600x300/021E73/FFFFFF?text=Image+Not+Available"; };

  const renderMediaGallery = () => {
    const allMedia = [];
    if (gameData.main_image) allMedia.push({ type: 'image', url: gameData.main_image });
    if (gameData.trailers) gameData.trailers.forEach(url => allMedia.push({ type: 'video', url }));
    if (gameData.screenshots) gameData.screenshots.forEach(url => { if(url !== gameData.main_image) allMedia.push({ type: 'image', url }); });

    if (allMedia.length === 0) return null;

    return (
      <div>
        <div style={styles.mainMediaDisplay}>
          {selectedMedia?.type === 'video' ? (
            <video controls autoPlay src={selectedMedia.url} style={{maxWidth:'100%', maxHeight:'500px'}} />
          ) : (
            <img src={selectedMedia?.url} onError={handleImageError} alt="Main" style={{maxWidth:'100%', maxHeight:'500px'}} />
          )}
        </div>
        <div style={styles.mediaContainer}>
          {allMedia.map((media, idx) => (
            <img 
              key={idx} 
              src={media.type === 'video' ? gameData.main_image : media.url}
              onError={(e) => e.target.style.display = 'none'}
              alt="thumb"
              style={{ ...styles.mediaItem, border: selectedMedia?.url === media.url ? '2px solid #5FCDD9' : '1px solid #027373' }}
              onClick={() => setSelectedMedia(media)}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderStoreList = () => {
    const deals = gameData.price_info?.deals || [];
    if (deals.length === 0 && gameData.price_info) {
        return (
            <div style={styles.storeRow}>
                <span style={styles.storeName}>{gameData.price_info.store_name}</span>
                <span style={styles.storePrice}>{getPriceDisplay(gameData.price_info.current_price)}</span>
                <a href={gameData.price_info.store_url} target="_blank" rel="noreferrer" style={styles.storeLink}>구매</a>
            </div>
        );
    }
    return deals.map((deal, idx) => (
        <div key={idx} style={styles.storeRow}>
            <div style={{display:'flex', alignItems:'center'}}>
                <span style={styles.storeName}>{deal.shopName}</span>
                {deal.discount > 0 && <span style={{marginLeft:'10px', color:'#D94F4C', fontSize:'12px'}}>-{deal.discount}%</span>}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                {deal.regularPrice > deal.price && <span style={{textDecoration:'line-through', color:'#888', fontSize:'12px'}}>{getPriceDisplay(deal.regularPrice)}</span>}
                <span style={styles.storePrice}>{getPriceDisplay(deal.price)}</span>
                <a href={deal.url} target="_blank" rel="noreferrer" style={styles.storeLink}>이동</a>
            </div>
        </div>
    ));
  };

  const renderPriceSection = () => {
    const pi = gameData.price_info;
    if (!pi) return null;
    const storeName = pi.store_name || "스토어";

    if (pi.isFree) {
      return (
        <>
          <h2 style={{ color: '#04BFAD' }}>무료 게임</h2>
          <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>{storeName}에서 받기</a>
        </>
      );
    }
    if (pi.regular_price === null) {
       return (
        <>
          <h2 style={{ color: '#aaa' }}>가격 정보 없음</h2>
          <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>{storeName} 확인</a>
        </>
       );
    }

    return (
      <>
        <h2 style={{ color: '#3D46F2' }}>
          {getPriceDisplay(pi.current_price)}
          {pi.discount_percent > 0 && <span> ({pi.discount_percent}% 할인)</span>}
        </h2>
        {pi.discount_percent > 0 && countdown && <p style={{ color: '#D94F4C' }}>남은 시간: {countdown}</p>}
        <p style={{ color: '#A24CD9' }}>역대 최저가: {getPriceDisplay(pi.historical_low)}</p>
        <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>{storeName}에서 구매하기</a>
        
        <div style={{marginTop:'20px', border:'1px solid #3D46F2', borderRadius:'8px', overflow:'hidden'}}>
            <div style={{padding:'10px', backgroundColor:'#011526', fontWeight:'bold', borderBottom:'1px solid #3D46F2'}}>다른 스토어 가격 비교</div>
            {renderStoreList()}
        </div>
      </>
    );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: 'auto', backgroundColor: '#011526', color: 'white' }}>
      <h1>{gameData.title}</h1>
      {renderMediaGallery()}
      <hr style={{ borderColor: '#021E73' }} />
      
      <div style={{marginBottom: '15px', display: 'flex', gap: '10px'}}>
        {gameData.metacritic_score > 0 && (
            <InfoWithTooltip 
                text={`메타크리틱: ${gameData.metacritic_score}`} 
                color="#F2B705" 
                tooltipText="전문가 리뷰 기반의 종합 평점입니다."
                icon="Ⓜ️"
            />
        )}
        <InfoWithTooltip 
            text={`플레이 타임: ${gameData.play_time}`} 
            color="#2A475E" 
            tooltipText="메인 스토리를 클리어하는 데 걸리는 평균 시간입니다 (출처: HowLongToBeat)."
            icon="⏳"
        />
      </div>

      {renderPriceSection()}
      <hr style={{ borderColor: '#021E73' }} />
      <h3>태그</h3>
      <div>{gameData.smart_tags?.map(t => <span key={t} style={styles.tagButton}>{t}</span>)}</div>
      <hr style={{ borderColor: '#021E73' }} />
      <h3>설명</h3>
      <p style={{ color: '#eee' }}>{gameData.description}</p>
      <hr style={{ borderColor: '#021E73' }} />
      <h3>사양</h3>
      <div style={styles.specBox}>
        <div>
            <strong>최소 사양</strong>
            <div dangerouslySetInnerHTML={{ __html: gameData.pc_requirements?.minimum || "최소 사양 정보 없음" }} />
        </div>
        <br/>
        <div>
            <strong>권장 사양</strong>
            <div dangerouslySetInnerHTML={{ __html: gameData.pc_requirements?.recommended || "권장 사양 정보 없음" }} />
        </div>
      </div>
      
      <hr style={{ borderColor: '#021E73' }} />
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <button style={isWishlisted ? styles.wishlistButtonActive : styles.wishlistButton} onClick={toggleWishlist}>
            {isWishlisted ? '💔 찜 취소' : '❤️ 찜하기'}
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
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
      </div>
    </div>
  );
}
export default ShopPage;
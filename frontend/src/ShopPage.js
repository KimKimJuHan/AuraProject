import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const styles = {
  buyButton: { display: 'inline-block', padding: '10px 15px', backgroundColor: '#3D46F2', color: '#FFFFFF', textDecoration: 'none', borderRadius: '999px', fontSize: '16px', border: 'none', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.7)' },
  tagButton: { margin: '4px', padding: '5px 10px', backgroundColor: '#A24CD9', color: '#011526', borderRadius: '999px', fontSize: '14px', border: 'none' },
  specBox: { backgroundColor: '#021E73', padding: '15px', lineHeight: '1.6', borderRadius: '8px', color: '#FFFFFF', boxShadow: '0 4px 12px rgba(0,0,0,0.6)' },
  wishlistButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#A24CD9', color: '#011526', border: 'none', borderRadius: '999px', fontWeight: 'bold' },
  // ★ 찜 취소 버튼 스타일
  wishlistButtonActive: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#D94F4C', color: '#FFFFFF', border: 'none', borderRadius: '999px', fontWeight: 'bold' },
  thumbButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', border: '1px solid #3D46F2', borderRadius: '999px', background: '#021E73', color: '#FFFFFF' },
  mediaContainer: { display: 'flex', overflowX: 'auto', padding: '10px 0', backgroundColor: '#011526' },
  mediaItem: { height: '100px', marginRight: '10px', borderRadius: '8px', border: '1px solid #3D46F2', cursor: 'pointer' },
  mainMediaDisplay: { width: '100%', maxWidth: '100%', height: 'auto', marginBottom: '10px', borderRadius: '8px', border: '1px solid #3D46F2', backgroundColor: '#000', display: 'flex', justifyContent: 'center' },
  storeRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #3D46F2', backgroundColor: '#021E73' },
  storeName: { fontWeight: 'bold', color: '#FFFFFF' },
  storePrice: { color: '#A24CD9', fontWeight: 'bold' },
  storeLink: { color: '#D494D9', textDecoration: 'none', border: '1px solid #D494D9', padding: '2px 8px', borderRadius: '4px' },
  // ★ HLTB, Metacritic 뱃지
  infoBadge: { display: 'inline-block', padding: '5px 10px', borderRadius: '5px', marginRight: '10px', fontWeight: 'bold', backgroundColor: '#3D46F2', color: 'white', fontSize: '14px' }
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

function ShopPage() {
  const { id } = useParams(); 
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [isWishlisted, setIsWishlisted] = useState(false); // ★ 찜 상태

  useEffect(() => {
    fetch(`http://localhost:8000/api/games/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setGameData(data);
        setLoading(false);
        if (data.main_image) setSelectedMedia({ type: 'image', url: data.main_image });
        
        // ★ 로컬 스토리지에서 찜 상태 확인
        const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
        setIsWishlisted(wishlist.includes(data.slug));
      })
      .catch(err => console.error(err));
  }, [id]); 

  // ★ 찜 토글 함수
  const toggleWishlist = () => {
    const wishlist = JSON.parse(localStorage.getItem('gameWishlist') || '[]');
    let newWishlist;
    if (isWishlisted) {
        newWishlist = wishlist.filter(slug => slug !== gameData.slug);
        alert("찜 목록에서 삭제되었습니다.");
    } else {
        newWishlist = [...wishlist, gameData.slug];
        alert("찜 목록에 추가되었습니다! '찜/비교' 탭에서 확인하세요.");
    }
    localStorage.setItem('gameWishlist', JSON.stringify(newWishlist));
    setIsWishlisted(!isWishlisted);
  };

  const countdown = useCountdown(gameData?.price_info?.expiry);

  if (loading) return <div style={{padding:'20px', color:'white'}}>로딩 중...</div>;
  if (!gameData) return <div style={{padding:'20px', color:'white'}}>데이터 없음!</div>;

  const handleImageError = (e) => { e.target.src = "https://via.placeholder.com/600x300?text=No+Image"; };

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
              onError={handleImageError}
              alt="thumb"
              style={{ ...styles.mediaItem, border: selectedMedia?.url === media.url ? '2px solid #5FCDD9' : '1px solid #021E73' }}
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
                <span style={styles.storePrice}>{gameData.price_info.current_price?.toLocaleString()}원</span>
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
                {deal.regularPrice > deal.price && <span style={{textDecoration:'line-through', color:'#888', fontSize:'12px'}}>{deal.regularPrice?.toLocaleString()}원</span>}
                <span style={styles.storePrice}>{deal.price?.toLocaleString()}원</span>
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
          {pi.current_price.toLocaleString()}원
          {pi.discount_percent > 0 && <span> ({pi.discount_percent}% 할인)</span>}
        </h2>
        {pi.discount_percent > 0 && countdown && <p style={{ color: '#D94F4C' }}>남은 시간: {countdown}</p>}
        <p style={{ color: '#A24CD9' }}>역대 최저가: {pi.historical_low.toLocaleString()}원</p>
        
        <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>
             최저가 구매 ({storeName})
        </a>
        
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
      
      {/* ★ [신규] 평점 및 플레이타임 표시 */}
      <div style={{marginBottom: '15px'}}>
        {gameData.metacritic_score > 0 && (
            <span style={{...styles.infoBadge, backgroundColor: '#F2B705', color: 'black'}}>
                Metacritic: {gameData.metacritic_score}
            </span>
        )}
        <span style={{...styles.infoBadge, backgroundColor: '#2A475E'}}>
            ⏳ HLTB: {gameData.play_time}
        </span>
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
        <div dangerouslySetInnerHTML={{ __html: gameData.pc_requirements?.minimum }} />
        <br/>
        <div dangerouslySetInnerHTML={{ __html: gameData.pc_requirements?.recommended }} />
      </div>
      <hr style={{ borderColor: '#021E73' }} />
      
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        {/* ★ 찜 버튼 로직 연결 */}
        <button 
            style={isWishlisted ? styles.wishlistButtonActive : styles.wishlistButton} 
            onClick={toggleWishlist}
        >
            {isWishlisted ? '💔 찜 취소' : '❤️ 찜하기'}
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={styles.thumbButton} onClick={() => alert('좋아요!')}>👍</button>
          <button style={styles.thumbButton} onClick={() => alert('싫어요!')}>👎</button>
        </div>
      </div>
    </div>
  );
}
export default ShopPage;
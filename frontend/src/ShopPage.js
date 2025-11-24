import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Skeleton from './Skeleton';

const styles = {
  buyButton: { display: 'inline-block', padding: '12px 30px', backgroundColor: '#E50914', color: '#FFFFFF', textDecoration: 'none', borderRadius: '4px', fontSize: '18px', border: 'none', cursor: 'pointer', fontWeight: 'bold' },
  // 스타일 충돌 방지 (border 개별 속성)
  mediaItem: { height: '100px', borderRadius: '4px', borderWidth:'2px', borderStyle:'solid', borderColor:'transparent', cursor: 'pointer', transition:'border-color 0.2s' },
  mainMediaDisplay: { width: '100%', maxWidth: '100%', height: 'auto', maxHeight:'500px', marginBottom: '10px', borderRadius: '4px', backgroundColor: '#000', display: 'flex', justifyContent: 'center', objectFit:'contain' },
  
  // ★ 링크 스타일 (흰색, 밑줄 없음, 블록 전체 클릭)
  storeRowLink: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #333', backgroundColor: '#181818', textDecoration: 'none', color: '#fff', transition: 'background 0.2s', cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
};

function ShopPage({ region }) { 
  const { id } = useParams(); 
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);

  useEffect(() => {
    const fetchDetails = async () => {
        try {
            const res = await axios.get(`http://localhost:8000/api/games/${id}`);
            setGameData(res.data);
            setLoading(false);
            // 초기 미디어: 트레일러 우선 -> 메인 이미지
            if (res.data.trailers?.length > 0) setSelectedMedia({ type: 'video', url: res.data.trailers[0] });
            else if (res.data.main_image) setSelectedMedia({ type: 'image', url: res.data.main_image });
        } catch (err) { setLoading(false); }
    };
    fetchDetails();
  }, [id]); 

  const getPriceDisplay = (price) => {
    if (price === null) return "정보 없음";
    return `₩${(Math.round(price / 10) * 10).toLocaleString()}`; 
  };

  const cleanHTML = (html) => DOMPurify.sanitize(html, { USE_PROFILES: { html: false } });

  if (loading) return <div className="net-panel"><Skeleton height="500px" /></div>;
  if (!gameData) return <div className="net-panel net-empty">게임을 찾을 수 없습니다.</div>;

  // ★ 미디어 갤러리 중복 제거 (메인 이미지가 스크린샷에 있으면 제외)
  const mediaList = [];
  gameData.trailers?.forEach(url => {
      // 유튜브 임베드 처리
      const embedUrl = url.includes('watch?v=') ? url.replace('watch?v=', 'embed/') : url;
      mediaList.push({ type: 'video', url: embedUrl });
  });
  
  // 메인 이미지는 갤러리 리스트에 넣지 않음 (중복 방지)
  gameData.screenshots?.forEach(url => {
      if (url !== gameData.main_image) mediaList.push({ type: 'image', url });
  });

  const pi = gameData.price_info;

  return (
    <div>
      {/* Hero Section */}
      <div style={{position:'relative', height:'70vh', width:'100%', backgroundImage:`url(${gameData.screenshots?.[0] || gameData.main_image})`, backgroundSize:'cover', backgroundPosition:'center'}}>
         <div style={{position:'absolute', inset:0, background:'linear-gradient(to top, #141414, transparent 80%)'}}></div>
         <div style={{position:'absolute', bottom:'50px', left:'4%', maxWidth:'800px', textShadow:'2px 2px 4px rgba(0,0,0,0.8)'}}>
            <h1 style={{fontSize:'50px', marginBottom:'15px', lineHeight:'1.1'}}>{gameData.title_ko || gameData.title}</h1>
            <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
                <span style={{border:'1px solid #fff', padding:'2px 6px', fontSize:'14px'}}>📅 {gameData.releaseDate ? new Date(gameData.releaseDate).toLocaleDateString() : '출시일 정보 없음'}</span>
                <span style={{color:'#46d369', fontWeight:'bold'}}>Metacritic {gameData.metacritic_score || 'N/A'}</span>
            </div>
            <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                 {pi && (
                    <a href={pi.store_url} target="_blank" rel="noreferrer" style={styles.buyButton}>
                        {pi.isFree ? "무료 플레이" : (pi.current_price ? `구매하기 ${getPriceDisplay(pi.current_price)}` : "가격 정보 확인")}
                    </a>
                 )}
                 {/* 찜/투표 버튼 생략 (MainPage와 동일하게 구현 가능) */}
            </div>
         </div>
      </div>

      <div className="net-panel">
        <h3 className="net-section-title">스크린샷 & 트레일러</h3>
        <div style={styles.mainMediaDisplay}>
          {selectedMedia?.type === 'video' ? (
            <iframe src={selectedMedia.url} style={{width:'100%', height:'100%', border:'none'}} allow="autoplay; encrypted-media" allowFullScreen />
          ) : (
            <img src={selectedMedia?.url} onError={(e)=>e.target.src="https://via.placeholder.com/600x300?text=No+Image"} alt="Main" style={{maxWidth:'100%', maxHeight:'500px', objectFit:'contain'}} />
          )}
        </div>
        <div style={styles.mediaContainer}>
          {mediaList.map((m, i) => (
            <img key={i} src={m.type==='video' ? gameData.main_image : m.url} 
                 style={{...styles.mediaItem, borderColor: selectedMedia?.url === m.url ? '#E50914' : 'transparent'}} 
                 onClick={() => setSelectedMedia(m)} alt="thumb" />
          ))}
        </div>

        <h3 className="net-section-title" style={{marginTop:'40px'}}>가격 비교</h3>
        <div style={{border:'1px solid #333', borderRadius:'8px', overflow:'hidden'}}>
            {pi?.deals?.map((deal, i) => (
                <a key={i} href={deal.url} target="_blank" rel="noreferrer" style={styles.storeRowLink}>
                    <span style={{fontWeight:'bold'}}>{deal.shopName}</span>
                    <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                        {deal.discount > 0 && <span style={{color:'#E50914', fontWeight:'bold'}}>-{deal.discount}%</span>}
                        <span style={{color:'#fff', fontWeight:'bold'}}>{getPriceDisplay(deal.price)}</span>
                        <span style={{color:'#999', fontSize:'12px'}}>이동 &gt;</span>
                    </div>
                </a>
            ))}
             {(!pi?.deals || pi.deals.length === 0) && <div style={{padding:'20px', textAlign:'center', color:'#666'}}>추가 스토어 정보가 없습니다.</div>}
        </div>

        <h3 className="net-section-title" style={{marginTop:'40px'}}>시스템 요구 사항</h3>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'40px', color:'#ccc', fontSize:'14px', lineHeight:'1.6'}}>
            <div>
                <strong style={{color:'#fff', display:'block', marginBottom:'10px'}}>최소 사양</strong>
                <div dangerouslySetInnerHTML={{ __html: cleanHTML(gameData.pc_requirements?.minimum || "정보 없음") }} />
            </div>
            <div>
                <strong style={{color:'#fff', display:'block', marginBottom:'10px'}}>권장 사양</strong>
                <div dangerouslySetInnerHTML={{ __html: cleanHTML(gameData.pc_requirements?.recommended || "권장 사양 정보 없음") }} />
            </div>
        </div>
      </div>
    </div>
  );
}
export default ShopPage;
// /frontend/src/ShopPage.js

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

// --- 스타일 객체 ---
const styles = {
  // (기존 스타일)
  buyButton: { display: 'inline-block', padding: '10px 15px', backgroundColor: '#5FCDD9', color: '#172026', textDecoration: 'none', borderRadius: '5px', fontSize: '16px', border: 'none', cursor: 'pointer', fontWeight: 'bold' },
  tagButton: { margin: '4px', padding: '5px 10px', backgroundColor: '#027373', color: 'white', borderRadius: '4px', fontSize: '14px', border: '1px solid #04BF9D' },
  specBox: { backgroundColor: '#027373', padding: '15px', lineHeight: '1.6', borderRadius: '5px', color: '#FFFFFF' },
  wishlistButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#027373', color: 'white', border: '1px solid #5FCDD9', borderRadius: '5px' },
  thumbButton: { padding: '10px 15px', fontSize: '16px', cursor: 'pointer', border: '1px solid #5FCDD9', borderRadius: '5px', background: '#027373', color: 'white' },
  
  // ★ [수정] 미디어 갤러리 스타일 (메인 이미지 포함)
  mediaContainer: { 
    display: 'flex', 
    overflowX: 'auto', // 가로 스크롤
    padding: '10px 0',
    backgroundColor: '#172026', // 배경색 어둡게
  },
  mediaItem: { // ★ [수정] 이름 변경 (이미지/비디오 공통)
    height: '180px', // 높이 통일
    marginRight: '10px', 
    borderRadius: '5px',
    border: '1px solid #027373',
    cursor: 'pointer',
  },
  mainMediaDisplay: { // ★ [신규] 선택된 미디어 표시 영역
    width: '100%',
    height: 'auto',
    maxHeight: '450px', // (트레일러 기준 16:9)
    border: 'none', 
    borderRadius: '5px', 
    marginBottom: '10px',
    backgroundColor: '#000', // (비디오 로딩 시 배경)
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // ★ [삭제] 리뷰 관련 스타일 삭제
};
// --- [스타일 끝] ---

// '카운트다운 타이머' 훅
function useCountdown(expiryTimestamp) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!expiryTimestamp) { setTimeLeft(null); return; }
    const intervalId = setInterval(() => {
      const now = new Date().getTime();
      const expiryTime = new Date(expiryTimestamp).getTime();
      const distance = expiryTime - now;
      if (distance < 0) {
        clearInterval(intervalId);
        setTimeLeft("할인 종료");
      } else {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft(`${days}일 ${hours}시간 ${minutes}분 ${seconds}초 남음`);
      }
    }, 1000); 
    return () => clearInterval(intervalId);
  }, [expiryTimestamp]);
  return timeLeft;
}

function ShopPage() {
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { id } = useParams(); 
  
  // ★ [신규] 미디어 갤러리용 상태
  const [selectedMedia, setSelectedMedia] = useState({ type: 'image', url: null });

  useEffect(() => {
    fetch(`http://localhost:8000/api/games/${id}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP 에러! Status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setGameData(data);
        setLoading(false);
        // ★ [신규] 로딩 완료 후 메인 이미지를 갤러리 기본값으로 설정
        if (data.main_image) {
          setSelectedMedia({ type: 'image', url: data.main_image });
        }
      })
      .catch(err => {
        console.error("API 호출 실패:", err);
        setError(err.message); 
        setLoading(false);
      });
  }, [id]); 

  const countdown = useCountdown(gameData?.price_info?.expiry);

  if (loading) return <div style={{ padding: '20px' }}>로딩 중...</div>;
  if (error) return <div style={{ padding: '20px', color: 'red' }}>데이터 로딩 실패: {error}</div>;
  if (!gameData) return <div style={{ padding: '20px' }}>데이터 없음!</div>;

  // ★ [삭제] '리뷰 점수' 렌더링 (삭제)
  
  // ★ [수정] '트레일러 및 스크린샷' 렌더링 (메인 이미지 포함)
  const renderMediaGallery = () => {
    // 1. 모든 미디어 소스를 하나의 배열로 합침
    const allMedia = [];
    if (gameData.main_image) {
      allMedia.push({ type: 'image', url: gameData.main_image });
    }
    if (gameData.trailers) {
      gameData.trailers.forEach(url => allMedia.push({ type: 'video', url }));
    }
    if (gameData.screenshots) {
      // (메인 이미지가 스크린샷에 중복될 수 있으므로 필터링)
      gameData.screenshots.forEach(url => {
        if (url !== gameData.main_image) {
          allMedia.push({ type: 'image', url });
        }
      });
    }

    if (allMedia.length === 0) return null;

    // 2. 선택된 미디어를 보여주는 메인 뷰
    const renderMainMedia = () => {
      if (!selectedMedia.url) return <div style={styles.mainMediaDisplay}></div>;

      if (selectedMedia.type === 'image') {
        return <img src={selectedMedia.url} alt="Main Media" style={styles.mainMediaDisplay} />;
      }
      
      if (selectedMedia.type === 'video') {
        return (
          <video 
            controls 
            autoPlay // (선택 시 자동 재생)
            style={styles.mainMediaDisplay} 
            src={selectedMedia.url}
            key={selectedMedia.url} // (src 변경 시 리로드)
          >
            브라우저가 video 태그를 지원하지 않습니다.
          </video>
        );
      }
      return null;
    };

    return (
      <>
        {/* 1. 선택된 미디어 표시 영역 */}
        {renderMainMedia()}

        {/* 2. 썸네일 가로 스크롤 영역 */}
        <div style={styles.mediaContainer}>
          {allMedia.map((media, index) => {
            // (비디오 썸네일은 따로 없으므로 첫 번째 스크린샷이나 메인 이미지를 썸네일로 써야 함 - 지금은 간단하게 이미지 URL로만)
            const thumbnailUrl = media.type === 'image' 
              ? media.url 
              : gameData.screenshots?.[0] || gameData.main_image; // (비디오 썸네일 대체)
              
            return (
              <img 
                key={index} 
                src={thumbnailUrl} 
                alt={`Media ${index+1}`} 
                style={{
                  ...styles.mediaItem, 
                  // (선택된 미디어 테두리 강조)
                  border: selectedMedia.url === media.url ? '2px solid #5FCDD9' : '1px solid #027373'
                }}
                onClick={() => setSelectedMedia(media)} 
              />
            );
          })}
        </div>
        <hr style={{ borderColor: '#027373' }} />
      </>
    );
  };

  // (기존) 가격 섹션 렌더링
  const renderPriceSection = () => {
    if (!gameData.price_info) return null;
    
    if (gameData.price_info.isFree) {
      return (
        <>
          <h2 style={{ color: '#04BFAD' }}>무료 게임</h2>
          <a href={gameData.price_info.store_url} target="_blank" rel="noopener noreferrer" style={styles.buyButton}>
            {gameData.price_info.store_name || 'Steam'}에서 받기
          </a>
        </>
      );
    }
    
    // ★ [수정] '0원' 버그 방지. Collector가 null로 보낸 경우
    if (gameData.price_info.regular_price === null) {
      return (
        <>
          <h2 style={{ color: '#aaa' }}>가격 정보 없음</h2>
          <a href={gameData.price_info.store_url} target="_blank" rel="noopener noreferrer" style={styles.buyButton}>
            Steam에서 확인
          </a>
        </>
      );
    }

    const storeName = gameData.price_info.store_name || "최저가";

    return (
      <>
        <h2 style={{ color: '#04BFAD' }}>
          {gameData.price_info.current_price.toLocaleString()}원
          {gameData.price_info.discount_percent > 0 && (
            <span> ({gameData.price_info.discount_percent}% 할인)</span>
          )}
        </h2>
        
        {gameData.price_info.discount_percent > 0 && countdown && (
          <p style={{ color: '#E04B4B', fontWeight: 'bold' }}>
            할인 종료까지: {countdown}
          </p>
        )}

        <p style={{ color: '#04BF9D' }}>
          역대 최저가: {gameData.price_info.historical_low.toLocaleString()}원
        </p>
        <a href={gameData.price_info.store_url} target="_blank" rel="noopener noreferrer" style={styles.buyButton}>
          {storeName}에서 구매하기
        </a>
      </>
    );
  }

  // --- 메인 JSX ---
  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: 'auto' }}>
      <h1>{gameData.title}</h1>
      
      {/* ★ [수정] 메인 이미지 대신 미디어 갤러리 렌더링 */}
      {renderMediaGallery()}

      <hr style={{ borderColor: '#027373' }} />
      {renderPriceSection()}
      <hr style={{ borderColor: '#027373' }} />
      <h3>태그</h3>
      <div>
        {gameData.smart_tags && gameData.smart_tags.map(tag => (
          <span key={tag} style={styles.tagButton}>
            {tag}
          </span>
        ))}
      </div>
      <hr style={{ borderColor: '#027373' }} />
      <h3>게임 설명</h3>
      <p style={{ color: '#eee' }}>{gameData.description}</p>
      <hr style={{ borderColor: '#027373' }} />
      <h3>PC 요구 사양</h3>
      {gameData.pc_requirements && (
        <div style={styles.specBox}>
          <div dangerouslySetInnerHTML={{ __html: gameData.pc_requirements.minimum }} />
          <br/>
          <div dangerouslySetInnerHTML={{ __html: gameData.pc_requirements.recommended }} />
        </div>
      )}
      <hr style={{ borderColor: '#027373' }} />
      <h3>이 게임/추천이 마음에 드시나요?</h3>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <button style={styles.wishlistButton} onClick={() => alert('찜!')}>
          ❤️ 찜하기 (Wishlist)
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={styles.thumbButton} onClick={() => alert('좋아요!')}>
            👍
          </button>
          <button style={styles.thumbButton} onClick={() => alert('싫어요!')}>
            👎
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShopPage;
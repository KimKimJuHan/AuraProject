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
  
  // ★ [신규] 미디어 및 리뷰 스타일
  mediaContainer: { 
    display: 'flex', 
    overflowX: 'auto', // 가로 스크롤
    padding: '10px 0' 
  },
  screenshot: { 
    height: '150px', 
    marginRight: '10px', 
    borderRadius: '5px',
    border: '1px solid #027373'
  },
  trailer: { 
    width: '100%', 
    maxWidth: '560px', 
    height: '315px', 
    border: 'none', 
    borderRadius: '5px', 
    marginBottom: '10px' 
  },
  reviewBox: {
    display: 'inline-block',
    padding: '8px 12px',
    borderRadius: '5px',
    fontWeight: 'bold',
    fontSize: '18px',
    backgroundColor: '#04BFAD', // (초록색)
    color: '#172026' // (어두운 배경색)
  }
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

  // ★ [신규] '리뷰 점수' 렌더링
  const renderReviewScore = () => {
    if (!gameData.review_score || gameData.review_score === 0) {
      return null; // 점수 없으면 표시 안 함
    }
    
    // 점수대별 색상 변경
    let reviewStyle = {...styles.reviewBox};
    if (gameData.review_score < 50) {
      reviewStyle.backgroundColor = '#E04B4B'; // (빨간색)
    } else if (gameData.review_score < 75) {
      reviewStyle.backgroundColor = '#F2B705'; // (노란색)
    }

    return (
      <div style={{ marginTop: '15px' }}>
        <div style={reviewStyle}>
          {gameData.review_platform}: {gameData.review_score}점
        </div>
      </div>
    );
  };

  // ★ [신규] '트레일러 및 스크린샷' 렌더링
  const renderMediaGallery = () => {
    const hasTrailers = gameData.trailers && gameData.trailers.length > 0;
    const hasScreenshots = gameData.screenshots && gameData.screenshots.length > 0;

    if (!hasTrailers && !hasScreenshots) return null;

    return (
      <>
        <hr style={{ borderColor: '#027373' }} />
        {/* 첫 번째 트레일러만 재생 */}
        {hasTrailers && (
          <div>
            <h3>트레일러</h3>
            <video 
              controls 
              style={styles.trailer} 
              src={gameData.trailers[0]}
              key={gameData.trailers[0]} // (src 변경 시 리로드)
            >
              브라우저가 video 태그를 지원하지 않습니다.
            </video>
          </div>
        )}
        
        {/* 스크린샷 가로 스크롤 */}
        {hasScreenshots && (
          <div>
            <h3>스크린샷</h3>
            <div style={styles.mediaContainer}>
              {gameData.screenshots.map((url, index) => (
                <img key={index} src={url} alt={`Screenshot ${index+1}`} style={styles.screenshot} />
              ))}
            </div>
          </div>
        )}
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
      
      {/* ★ [신규] 리뷰 점수 표시 */}
      {renderReviewScore()}

      <img src={gameData.main_image} alt={gameData.title} style={{ width: '100%', maxWidth: '460px', borderRadius: '5px', marginTop: '15px' }} />
      <hr style={{ borderColor: '#027373' }} />

      {renderPriceSection()}
      
      {/* ★ [신규] 미디어 갤러리 표시 */}
      {renderMediaGallery()}

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
          {/* (보안) Steam에서 온 HTML이므로 신뢰함 */}
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
import React, { useEffect, useState } from 'react';

function OnboardingPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('game_onboarding_seen');
    if (!seen) setVisible(true);
  }, []);

  const handleClose = () => setVisible(false);
  const handleNeverShow = () => {
    localStorage.setItem('game_onboarding_seen', '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 32,
      left: 32,
      zIndex: 9999,
      background: 'rgba(255,255,255,0.97)', // 반투명 테마
      borderRadius: 14,
      boxShadow: '0 4px 32px 0 rgba(60,60,80,0.18), 0 2px 8px 0 rgba(50,0,60,0.07)',
      padding: 28,
      maxWidth: 350,
      minWidth: 250,
      textAlign: 'left',
      color: '#23252C',
      fontFamily: "'Segoe UI', 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif",
      lineHeight: 1.6,
      border: '1px solid #e7e9ee',
      boxSizing: 'border-box',
      animation: 'popup-fade-in 0.7s',
      transition: 'box-shadow 0.2s'
    }}>
      <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 6, letterSpacing: '-1.2px', color: "#1D242F"}}>
        🚀 더 똑똑한 게임 추천을 원한다면?
      </div>
      <ul style={{ fontSize: 15, margin: "18px 0 14px 20px", padding: 0, listStyle: "disc" }}>
        <li><b>로그인</b> 후 <b>마이페이지</b> 이동</li>
        <li>아래에서 <b>Steam 계정 연동</b></li>
        <li><span style={{ color: "#4B54F9" }}><b>알고리즘 맞춤 게임 추천</b></span> 받기</li>
        <li style={{
            marginTop: 7,
            fontSize: 13.5,
            color: "#435870"
          }}>
          <b>연동 없이도 추천은 계속!</b><br/>
          연동하면 더 빠르고 정확해집니다
        </li>
      </ul>
      <div style={{
        display: 'flex',
        gap: 8,
        marginTop: 12
      }}>
        <button onClick={handleClose} style={{
          background: '#f6f8fd',
          border: 'none',
          borderRadius: 6,
          padding: "7px 17px",
          color: "#4651B6",
          fontWeight: 600,
          boxShadow: "0 1px 2px #0001",
          cursor: 'pointer',
          fontSize: 15,
          transition: ".1s background"
        }}
        onMouseOver={e => e.currentTarget.style.background='#e8eafe'}
        onMouseOut={e => e.currentTarget.style.background='#f6f8fd'}
        >닫기</button>
        <button onClick={handleNeverShow} style={{
          background: "#4353F6",
          color: "white",
          border: "none",
          borderRadius: 6,
          padding: "7px 17px",
          fontWeight: 700,
          fontSize: 15,
          boxShadow: "0 1px 6px #4353F622",
          cursor: 'pointer',
          transition: ".1s background"
        }}
        onMouseOver={e => e.currentTarget.style.background='#2d3bb0'}
        onMouseOut={e => e.currentTarget.style.background='#4353F6'}
        >다시 보지 않기</button>
      </div>
      <style>{`
        @keyframes popup-fade-in {
          0% { opacity: 0; transform: translateY(-24px);}
          80% { opacity: 0.93; }
          100% { opacity: 1; transform: translateY(0);}
        }
      `}</style>
    </div>
  );
}

export default OnboardingPopup;
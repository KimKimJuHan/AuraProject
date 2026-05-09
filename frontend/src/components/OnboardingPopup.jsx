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
      top: 88,
      left: 32,
      zIndex: 9999,
      background: '#181818',
      borderRadius: 10,
      boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
      padding: '24px 28px',
      maxWidth: 340,
      minWidth: 260,
      textAlign: 'left',
      color: '#e5e5e5',
      fontFamily: "'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
      lineHeight: 1.6,
      border: '1px solid #333',
      boxSizing: 'border-box',
      animation: 'popup-fade-in 0.5s',
    }}>
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 12, color: '#fff', letterSpacing: '-0.5px' }}>
        더 정확한 게임 추천을 받으려면?
      </div>
      <ul style={{ fontSize: 14, margin: '0 0 16px 18px', padding: 0, listStyle: 'disc', color: '#ccc' }}>
        <li style={{ marginBottom: 6 }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>로그인</span> 후 마이페이지 이동
        </li>
        <li style={{ marginBottom: 6 }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>Steam 계정 연동</span>으로 플레이 이력 분석
        </li>
        <li style={{ marginBottom: 6, color: '#e50914', fontWeight: 600 }}>
          알고리즘 맞춤 추천 받기
        </li>
        <li style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          연동 없이도 태그 기반 추천 이용 가능
        </li>
      </ul>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleClose}
          style={{
            flex: 1,
            background: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: 6,
            padding: '8px 0',
            color: '#aaa',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: 14,
          }}
          onMouseOver={e => e.currentTarget.style.background = '#333'}
          onMouseOut={e => e.currentTarget.style.background = '#2a2a2a'}
        >닫기</button>
        <button
          onClick={handleNeverShow}
          style={{
            flex: 1,
            background: '#e50914',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 0',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
          onMouseOver={e => e.currentTarget.style.background = '#c40812'}
          onMouseOut={e => e.currentTarget.style.background = '#e50914'}
        >다시 보지 않기</button>
      </div>
      <style>{`
        @keyframes popup-fade-in {
          0% { opacity: 0; transform: translateY(-16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default OnboardingPopup;
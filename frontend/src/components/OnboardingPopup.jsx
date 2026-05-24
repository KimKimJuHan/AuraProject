import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

function OnboardingPopup() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (location.pathname !== '/') { setVisible(false); return; }
    const seen = localStorage.getItem('game_onboarding_seen');
    const closed = sessionStorage.getItem('game_onboarding_closed');
    if (!seen && !closed) setVisible(true);
  }, [location.pathname]);

  const handleClose = () => {
    sessionStorage.setItem('game_onboarding_closed', '1');
    setVisible(false);
  };

  const handleNeverShow = () => {
    localStorage.setItem('game_onboarding_seen', '1');
    setVisible(false);
  };

  if (!visible || location.pathname !== '/') return null;

  return (
    <div style={{
      position: 'fixed', top: 88, left: 32, zIndex: 9999,
      background: 'var(--bg-overlay)',
      borderRadius: 14,
      boxShadow: '0 10px 40px rgba(0,0,0,0.62)',
      padding: 28, maxWidth: 350, minWidth: 250,
      textAlign: 'left', color: 'var(--text-primary)',
      fontFamily: "'Segoe UI', 'Noto Sans KR', Arial, sans-serif",
      lineHeight: 1.6, border: '1px solid var(--border)', boxSizing: 'border-box',
      animation: 'popup-fade-in 0.32s ease-out'
    }}>
      <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 6, letterSpacing: '-1.2px', color: 'var(--text-primary)' }}>
        더 똑똑한 게임 추천을 원한다면?
      </div>
      <ul style={{ fontSize: 15, margin: '18px 0 14px 20px', padding: 0, listStyle: 'disc', color: 'var(--text-secondary)' }}>
        <li><b>로그인</b> 후 <b>마이페이지</b> 이동</li>
        <li>아래에서 <b>Steam 계정 연동</b></li>
        <li><span style={{ color: '#E50914', fontWeight: 900 }}><b>알고리즘 맞춤 게임 추천</b></span> 받기</li>
        <li style={{ marginTop: 7, fontSize: 13.5, color: '#b6b6b6' }}>
          <b style={{ color: '#ddd' }}>연동 없이도 추천은 계속!</b><br/>
          연동하면 더 빠르고 정확해집니다
        </li>
      </ul>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={handleClose} style={{
          flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 9,
          padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 900, cursor: 'pointer', fontSize: 14
        }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseOut={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        >닫기</button>
        <button onClick={handleNeverShow} style={{
          flex: 1, background: '#E50914', color: '#fff', border: '1px solid #E50914',
          borderRadius: 9, padding: '10px 12px', fontWeight: 900, cursor: 'pointer', fontSize: 14
        }}
          onMouseOver={e => e.currentTarget.style.background = '#ff2a2a'}
          onMouseOut={e => e.currentTarget.style.background = '#E50914'}
        >다시 보지 않기</button>
      </div>
      <style>{`
        @keyframes popup-fade-in {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default OnboardingPopup;
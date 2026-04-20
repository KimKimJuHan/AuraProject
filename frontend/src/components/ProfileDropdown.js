import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RecentGames from './RecentGames';
import './ProfileDropdown.css';

export default function ProfileDropdown({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#fff", fontSize: 22, padding: "6px 10px"
        }}
        aria-label="메뉴 열기"
      >
        <span role="img" aria-label="menu">☰</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "110%",
          background: "#202020", border: "1px solid #444", borderRadius: 8,
          boxShadow: "0 3px 16px rgba(0,0,0,0.28)",
          minWidth: 200, zIndex: 99, paddingBottom: 7
        }}>
          {/* ★ App.js에서 넘어온 핵심 메뉴들 */}
          <Link to="/recommend/personal" className="profile-dropdown-menu" onClick={() => setOpen(false)}>맞춤 게임 추천</Link>
          <Link to="/comparison" className="profile-dropdown-menu" onClick={() => setOpen(false)}>찜 및 가격 비교</Link>
          
          <div style={{ borderTop: '1px solid #333', margin: '4px 0' }} />
          
          <Link to="/mypage" className="profile-dropdown-menu" onClick={() => setOpen(false)}>마이페이지</Link>
          <Link to="/support/faq" className="profile-dropdown-menu" onClick={() => setOpen(false)}>고객센터</Link>
          
          {user ? (
            <button
              onClick={() => { onLogout(); setOpen(false); }}
              className="profile-dropdown-menu"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#E50914', cursor: 'pointer' }}
              type="button"
            >로그아웃</button>
          ) : (
            <Link to="/login" className="profile-dropdown-menu" onClick={() => setOpen(false)}>로그인</Link>
          )}
          
          {/* 구분선 및 최근 본 게임 */}
          <div style={{ borderTop: '1px solid #333', margin: '8px 0 0 0' }} />
          <RecentGames maxCount={4} />
        </div>
      )}
    </div>
  );
}
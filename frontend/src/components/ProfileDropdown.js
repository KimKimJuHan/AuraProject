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
          <Link to="/mypage" className="profile-dropdown-menu">마이페이지</Link>
          <Link to="/support/faq" className="profile-dropdown-menu">고객센터</Link>
          {user ? (
            <button
              onClick={() => { onLogout(); setOpen(false); }}
              className="profile-dropdown-menu"
              type="button"
            >로그아웃</button>
          ) : (
            <Link to="/login" className="profile-dropdown-menu">로그인</Link>
          )}
          {/* 구분선 */}
          <div style={{ borderTop: '1px solid #333', margin: '8px 0 0 0' }} />
          {/* 최근 본 게임 */}
          <RecentGames maxCount={4} />
        </div>
      )}
    </div>
  );
}
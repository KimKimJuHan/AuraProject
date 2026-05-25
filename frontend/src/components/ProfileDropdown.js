import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import RecentGames from './RecentGames';
import './ProfileDropdown.css';

export default function ProfileDropdown({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
        className="profile-dropdown-btn"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-primary)",
          fontSize: 32,
          padding: "6px 10px",
          lineHeight: 1
        }}
        aria-label="메뉴 열기"
        type="button"
      >
        <span role="img" aria-label="menu" style={{fontSize: '32px'}}>≡</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 3px 16px rgba(0,0,0,0.28)",
            minWidth: 200,
            zIndex: 99,
            paddingBottom: 7
          }}
        >
          <Link
            to="/recommend/personal"
            className="profile-dropdown-menu"
            onClick={() => setOpen(false)}
          >
            맞춤 게임 추천
          </Link>

          <Link
            to="/comparison"
            className="profile-dropdown-menu"
            onClick={() => setOpen(false)}
          >
            찜 및 가격 비교
          </Link>

          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

          <Link
            to="/mypage"
            className="profile-dropdown-menu"
            onClick={() => setOpen(false)}
          >
            마이페이지
          </Link>

          <Link
            to="/support/faq"
            className="profile-dropdown-menu"
            onClick={() => setOpen(false)}
          >
            고객센터
          </Link>

          <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 0 0' }} />
          <RecentGames maxCount={4} />
        </div>
      )}
    </div>
  );
}
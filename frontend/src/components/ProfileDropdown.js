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
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#fff",
          fontSize: 22,
          padding: "6px 10px"
        }}
        aria-label="메뉴 열기"
        type="button"
      >
        <span role="img" aria-label="menu">☰</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            background: "#202020",
            border: "1px solid #444",
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

          <div style={{ borderTop: '1px solid #333', margin: '4px 0' }} />

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

          <div style={{ borderTop: '1px solid #333', margin: '8px 0 0 0' }} />
          <RecentGames maxCount={4} />
        </div>
      )}
    </div>
  );
}
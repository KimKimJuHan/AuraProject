import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import RecentGames from './RecentGames';
import { useTheme } from '../context/ThemeContext';

export default function ProfileDropdown({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const menuStyle = {
    fontSize: 15,
    fontWeight: 600,
    color: isLight ? '#111' : '#eee',
    textDecoration: 'none',
    display: 'block',
    padding: '13px 20px',
    background: 'none',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background 0.15s',
  };

  const menuHoverStyle = isLight
    ? { ...menuStyle, background: '#f0f0f0' }
    : { ...menuStyle, background: '#2a2a2a' };

  const [hovered, setHovered] = useState(null);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="profile-dropdown-btn"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: isLight ? '#111' : '#fff',
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
            background: isLight ? '#ffffff' : '#1e1e1e',
            border: `1px solid ${isLight ? '#ddd' : '#333'}`,
            borderRadius: 8,
            boxShadow: isLight
              ? '0 4px 16px rgba(0,0,0,0.12)'
              : '0 3px 16px rgba(0,0,0,0.5)',
            minWidth: 210,
            zIndex: 99,
            paddingBottom: 7,
          }}
        >
          {[
            { to: '/recommend/personal', label: '맞춤 게임 추천' },
            { to: '/comparison',         label: '찜 및 가격 비교' },
          ].map(item => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              onMouseEnter={() => setHovered(item.to)}
              onMouseLeave={() => setHovered(null)}
              style={hovered === item.to ? menuHoverStyle : menuStyle}
            >
              {item.label}
            </Link>
          ))}

          <div style={{ borderTop: `1px solid ${isLight ? '#eee' : '#333'}`, margin: '4px 0' }} />

          {[
            { to: '/mypage',      label: '마이페이지' },
            { to: '/support/faq', label: '고객센터' },
          ].map(item => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              onMouseEnter={() => setHovered(item.to)}
              onMouseLeave={() => setHovered(null)}
              style={hovered === item.to ? menuHoverStyle : menuStyle}
            >
              {item.label}
            </Link>
          ))}

          <div style={{ borderTop: `1px solid ${isLight ? '#eee' : '#333'}`, margin: '8px 0 0 0' }} />
          <RecentGames maxCount={4} />
        </div>
      )}
    </div>
  );
}
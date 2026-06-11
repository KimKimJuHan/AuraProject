// src/components/RecentGames.js
import React, { useState, useEffect } from 'react';

export default function RecentGames({ maxCount = 4 }) {
  const [games, setGames] = useState([]);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem('recentGames') || '[]');
      setGames(Array.isArray(data) ? data.slice(0, maxCount) : []);
    } catch {
      setGames([]);
    }
  }, [maxCount]);

  if (!games.length) return null;
  return (
    <div style={{ paddingBottom: '5px' }}>
      <div style={{ color: 'var(--text-secondary, #bbb)', fontSize: '13px', margin: '8px 22px 3px' }}>최근 본 게임</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 22px 10px' }}>
        {games.map(g => (
          <a key={g.slug} href={`/game/${g.slug}`} style={{ minWidth: 66, textDecoration: 'none', color: 'var(--text-primary, #fff)', flexShrink: 0, display: 'block' }}>
            <img src={g.main_image} alt={g.title} style={{ width: 66, height: 37, borderRadius: 4, objectFit: 'cover', marginBottom: 3, border: '1px solid var(--border)' }} onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22300%22 height%3D%22169%22%3E%3Crect width%3D%22300%22 height%3D%22169%22 fill%3D%22%23202020%22%2F%3E%3Ctext x%3D%22150%22 y%3D%2290%22 font-family%3D%22sans-serif%22 font-size%3D%2214%22 fill%3D%22%23555%22 text-anchor%3D%22middle%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E'; }} />
            <div style={{ fontSize: 10, color: 'var(--text-secondary, #ccc)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textAlign: 'center', maxWidth: 66 }}>{g.title_ko || g.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
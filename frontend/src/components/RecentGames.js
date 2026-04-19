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
    <div style={{ padding: '10px 0' }}>
      <div style={{ color: '#bbb', fontSize: '13px', margin: '8px 22px 3px' }}>최근 본 게임</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 22px 10px' }}>
        {games.map(g => (
          <a key={g.slug} href={`/game/${g.slug}`} style={{ minWidth: 66, textDecoration: 'none', color: '#fff', flexShrink: 0, display: 'block' }}>
            <img src={g.main_image} alt={g.title} style={{ width: 66, height: 37, borderRadius: 4, objectFit: 'cover', marginBottom: 3, border: '1px solid #333' }} />
            <div style={{ fontSize: 10, color: '#ccc', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textAlign: 'center', maxWidth: 66 }}>{g.title_ko || g.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
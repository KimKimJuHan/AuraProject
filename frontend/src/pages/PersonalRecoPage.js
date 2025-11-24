import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Skeleton from '../Skeleton';

function PersonalRecoPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) { setError("로그인이 필요합니다."); setLoading(false); return; }

    axios.post('http://localhost:8000/api/ai-recommend/personal', { userId: user.id })
      .then(res => { setGames(res.data); setLoading(false); })
      .catch(() => { setError("추천 실패"); setLoading(false); });
  }, []);

  if (loading) return <div className="net-panel"><Skeleton height="400px"/></div>;
  if (error) return <div className="net-panel net-empty">{error} <Link to="/login" style={{color:'#E50914'}}>로그인</Link></div>;

  return (
    <div className="net-panel">
        <h2 className="net-section-title">🔥 지금 뜨는 맞춤 추천 (Chzzk + Twitch 반영)</h2>
        <div className="net-cards">
            {games.map(g => (
                <Link to={`/game/${g.slug}`} key={g.slug} className="net-card">
                    <div className="net-card-thumb"><img src={g.main_image} alt="" /></div>
                    <div className="net-card-body">
                        <div className="net-card-title">{g.title_ko || g.title}</div>
                        <div className="net-card-footer">
                            <span style={{color:'#46d369'}}>매칭률 {Math.round(g.score * 100)}%</span>
                            {g.trend_score > 1000 && <span style={{fontSize:'10px', border:'1px solid red', padding:'2px'}}>LIVE🔥</span>}
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    </div>
  );
}
export default PersonalRecoPage;
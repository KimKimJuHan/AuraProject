import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import Skeleton from '../Skeleton';

const TAG_CATEGORIES = {
  '장르': ['RPG', 'FPS', '시뮬레이션', '전략', '로그라이크', '소울라이크'],
  '특징': ['오픈 월드', '협동', '스토리 중심', '경쟁']
};

function PersonalRecoPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  
  const [searchParams] = useSearchParams();
  const steamIdFromUrl = searchParams.get('steamId');
  const [steamId, setSteamId] = useState(steamIdFromUrl || '');

  useEffect(() => {
    if (steamIdFromUrl) setSteamId(steamIdFromUrl);
  }, [steamIdFromUrl]);

  const fetchRecommendations = async () => {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('user'));
      try {
        const res = await axios.post('http://localhost:8000/api/ai-recommend/personal', { 
            userId: user?.id,
            tags: selectedTags,
            steamId: steamId 
        });
        setGames(res.data);
      } catch (err) { console.error(err); } 
      finally { setLoading(false); }
  };

  useEffect(() => { fetchRecommendations(); }, [selectedTags, steamId]);

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleSteamLogin = () => {
      window.location.href = 'http://localhost:8000/api/auth/steam';
  };

  return (
    <div className="net-panel">
        <h2 className="net-section-title" style={{borderLeftColor:'#E50914'}}>🤖 AI 맞춤 추천</h2>

        {/* 스팀 연동 버튼 */}
        {!steamId ? (
            <div style={{backgroundColor:'#1b2838', padding:'20px', borderRadius:'8px', marginBottom:'30px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <span style={{color:'#fff', fontWeight:'bold'}}>내 스팀 라이브러리 분석하기</span>
                <button onClick={handleSteamLogin} style={{backgroundColor:'#66c0f4', border:'none', padding:'10px 20px', borderRadius:'4px', fontWeight:'bold', cursor:'pointer', color:'#fff'}}>
                    Steam으로 로그인
                </button>
            </div>
        ) : (
            <div style={{backgroundColor:'#181818', padding:'15px', borderRadius:'8px', marginBottom:'30px', border:'1px solid #46d369', color:'#46d369'}}>
                ✅ 스팀 계정이 연동되었습니다. (ID: {steamId})
            </div>
        )}

        {/* 태그 필터 */}
        <div style={{marginBottom:'30px', display:'flex', gap:'10px', flexWrap:'wrap'}}>
            {Object.values(TAG_CATEGORIES).flat().map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                    style={{
                        padding:'6px 14px', borderRadius:'20px', border:'1px solid #444', 
                        background: selectedTags.includes(tag) ? '#E50914' : '#222',
                        color: 'white', cursor:'pointer'
                    }}
                >
                    {tag}
                </button>
            ))}
        </div>

        {/* 결과 리스트 */}
        {loading ? <Skeleton height="300px" /> : (
            <div className="net-cards">
                {games.map(g => (
                    <Link to={`/game/${g.slug}`} key={g.slug} className="net-card">
                        <div className="net-card-thumb"><img src={g.main_image} alt=""/></div>
                        <div className="net-card-body">
                            <div className="net-card-title">{g.title_ko || g.title}</div>
                            <div className="net-card-footer">
                                <span style={{color:'#46d369'}}>{Math.round(g.score*100)}% 일치</span>
                                {g.trend_score > 500 && <span style={{fontSize:'10px', border:'1px solid red', color:'red', padding:'2px'}}>HOT</span>}
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        )}
    </div>
  );
}
export default PersonalRecoPage;
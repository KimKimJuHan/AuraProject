import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Skeleton from '../Skeleton';

// 태그 카테고리 (메인 페이지와 동일)
const TAG_CATEGORIES = {
  '장르': ['RPG', 'FPS', '시뮬레이션', '전략'],
  '특징': ['오픈 월드', '협동', '스토리 중심']
};

function PersonalRecoPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);

  useEffect(() => {
    const fetchRecommendations = async () => {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('user'));
      
      // 로그인이 안 되어 있으면 로그인 유도
      if (!user) {
        setError("로그인이 필요한 서비스입니다.");
        setLoading(false);
        return;
      }

      try {
        // 백엔드에 유저 ID와 선택된 태그를 함께 보내서 추천 받음
        const res = await axios.post('http://localhost:8000/api/ai-recommend/personal', { 
            userId: user.id,
            tags: selectedTags 
        });
        setGames(res.data);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("추천을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [selectedTags]); // 태그가 바뀔 때마다 재요청

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  if (loading) return <div className="net-panel" style={{textAlign:'center'}}><Skeleton height="400px" /></div>;

  if (error) return (
    <div className="net-panel" style={{textAlign:'center', marginTop:'100px'}}>
      <h2>{error}</h2>
      <Link to="/login" style={{color:'#E50914', textDecoration:'none', fontSize:'18px', display:'block', marginTop:'20px'}}>로그인 하러 가기 &gt;</Link>
    </div>
  );

  return (
    <div className="net-panel">
        <h2 className="net-section-title" style={{borderLeftColor:'#E50914'}}>
            🤖 AI 맞춤 추천
        </h2>
        <p style={{color:'#bbb', marginBottom:'30px'}}>회원님의 활동과 선택한 태그를 분석하여 선정한 게임입니다.</p>

        {/* 태그 필터 (심플 버전) */}
        <div style={{marginBottom:'30px', display:'flex', gap:'10px', flexWrap:'wrap'}}>
            {Object.values(TAG_CATEGORIES).flat().map(tag => (
                <button 
                    key={tag} 
                    onClick={() => toggleTag(tag)}
                    style={{
                        padding:'5px 12px', borderRadius:'15px', border:'1px solid #444', 
                        background: selectedTags.includes(tag) ? '#E50914' : '#222',
                        color: 'white', cursor:'pointer'
                    }}
                >
                    {tag}
                </button>
            ))}
        </div>

        {games.length === 0 ? (
            <div className="net-empty">추천할 데이터가 부족합니다. 더 많은 게임을 찜하거나 태그를 선택해보세요!</div>
        ) : (
            <div className="net-cards">
                {games.map(g => (
                    <Link to={`/game/${g.slug}`} key={g.slug} className="net-card">
                        <div className="net-card-thumb"><img src={g.main_image} alt="" /></div>
                        <div className="net-card-body">
                            <div className="net-card-title">{g.title_ko || g.title}</div>
                            <div className="net-card-footer">
                                <span style={{color:'#46d369', fontWeight:'bold'}}>
                                    {Math.round(g.score * 100)}% 일치
                                </span>
                                {g.trend_score > 500 && <span style={{fontSize:'10px', border:'1px solid red', padding:'2px'}}>🔥TRENDING</span>}
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
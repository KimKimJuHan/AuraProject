import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import Skeleton from '../Skeleton';

// 태그 카테고리 정의
const TAG_CATEGORIES = {
  '장르': ['RPG', 'FPS', '시뮬레이션', '전략', '로그라이크', '소울라이크', '액션', '어드벤처'],
  '특징': ['오픈 월드', '협동', '스토리 중심', '경쟁', '멀티플레이', '싱글플레이', '판타지', 'SF']
};

function PersonalRecoPage({ user }) {
  const [games, setGames] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  
  const [steamGames, setSteamGames] = useState([]); 
  const [topGames, setTopGames] = useState([]);     
  const [steamStatus, setSteamStatus] = useState('LOADING'); 

  const [searchParams] = useSearchParams();
  const urlSteamId = searchParams.get('steamId');

  // 1. 로그인 유저 확인 및 스팀 연동 상태 체크
  useEffect(() => {
    if (user) {
        checkSteamConnection();
    } else {
        setSteamStatus('GUEST'); // 게스트 모드
    }
  }, [user, urlSteamId]);

  // 2. 태그 변경 시 추천 리스트 갱신
  useEffect(() => {
      fetchRecommendations(); 
  }, [selectedTags, steamStatus]);

  const checkSteamConnection = async () => {
    setSteamStatus('LOADING');
    try {
        const res = await axios.get('http://localhost:8000/api/user/games', { withCredentials: true });
        const allGames = res.data || [];
        setSteamGames(allGames);
        const sorted = [...allGames]
            .filter(g => g && g.name && g.playtime_forever > 0) 
            .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
            .slice(0, 5);
        setTopGames(sorted);
        setSteamStatus('LINKED');
    } catch (err) {
        console.error("스팀 연동 확인 실패:", err);
        if (err.response?.status === 403) setSteamStatus('PRIVATE');
        else setSteamStatus('NOT_LINKED');
    }
  };

  const fetchRecommendations = async () => {
      setLoading(true);
      try {
        const res = await axios.post('http://localhost:8000/api/ai-recommend/personal', { 
            userId: user?.id || user?._id || null, // 게스트는 null
            tags: selectedTags,
            steamId: (steamStatus === 'LINKED') ? 'LINKED' : '' 
        });
        
        const recoGames = Array.isArray(res.data) ? res.data : (res.data.games || []);
        setGames(recoGames); 
      } catch (err) { 
          console.error("추천 실패:", err); 
          setGames([]); 
      } finally { 
          setLoading(false); 
      }
  };

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleLinkSteam = () => {
      window.location.href = 'http://localhost:8000/api/auth/steam?link=true';
  };

  const formatPlaytime = (minutes) => {
      if (minutes < 60) return `${minutes}분`;
      return `${Math.floor(minutes / 60)}시간`;
  };

  return (
    <div className="net-panel">
        <h2 className="net-section-title" style={{borderLeftColor:'#E50914', fontSize:'28px', marginBottom:'30px'}}>
            🤖 AI 맞춤 추천
        </h2>

        {/* 1. 스팀 연동 상태 섹션 (게스트일 땐 안내문구, 로그인이면 상태 표시) */}
        <div style={{marginBottom:'50px'}}>
            {!user ? (
                <div style={styles.ctaBox}>
                    <div style={{flex:1}}>
                        <h3 style={{margin:'0 0 10px 0', color:'#fff'}}>로그인하고 스팀 계정을 연동해보세요!</h3>
                        <p style={{margin:0, color:'#aaa', lineHeight:'1.5'}}>
                            로그인하면 내 스팀 플레이 기록을 분석하여 더 정교한 추천을 받을 수 있습니다.<br/>
                            (현재는 태그 기반 추천만 가능합니다)
                        </p>
                    </div>
                    <Link to="/login" style={{...styles.steamButton, backgroundColor:'#E50914', textDecoration:'none', display:'inline-block', textAlign:'center'}}>
                        로그인하기
                    </Link>
                </div>
            ) : (
                <>
                    {steamStatus === 'LOADING' && (
                        <div style={styles.statusBox}><div style={{fontSize:'24px', marginBottom:'10px'}}>🔄</div><div>스팀 라이브러리를 분석하고 있습니다...</div></div>
                    )}
                    {steamStatus === 'NOT_LINKED' && (
                        <div style={styles.ctaBox}>
                            <div style={{flex:1}}>
                                <h3 style={{margin:'0 0 10px 0', color:'#fff'}}>스팀 계정을 연동해보세요!</h3>
                                <p style={{margin:0, color:'#aaa', lineHeight:'1.5'}}>플레이 기록을 분석하여 취향 저격 게임을 찾아드립니다.</p>
                            </div>
                            <button onClick={handleLinkSteam} style={styles.steamButton}>🎮 Steam 연동하기</button>
                        </div>
                    )}
                    {steamStatus === 'PRIVATE' && (
                        <div style={{...styles.statusBox, borderColor:'#ff4444', backgroundColor:'#3a1d1d'}}>
                            <div style={{fontSize:'24px', marginBottom:'10px'}}>🔒</div>
                            <h3 style={{color:'#ff4444', marginTop:0}}>스팀 프로필이 비공개 상태입니다</h3>
                            <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noreferrer" style={styles.linkButton}>공개 설정하러 가기 &gt;</a>
                            <button onClick={checkSteamConnection} style={{...styles.textButton, marginTop:'15px'}}>다시 시도 ⟳</button>
                        </div>
                    )}
                    {steamStatus === 'LINKED' && (
                        <div style={styles.dashboard}>
                            <div style={{marginBottom:'20px', borderBottom:'1px solid #444', paddingBottom:'15px'}}>
                                <h3 style={{margin:0, color:'#66c0f4'}}>📊 {user?.username}님의 게임 성향 분석</h3>
                            </div>
                            {/* ... (상위 게임 리스트 렌더링 코드 유지) ... */}
                            {topGames.length > 0 ? (
                                <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                                    {topGames.map((game, index) => {
                                        const maxTime = topGames[0].playtime_forever || 1;
                                        const percent = (game.playtime_forever / maxTime) * 100;
                                        const iconUrl = game.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg` : 'https://via.placeholder.com/32?text=?';
                                        return (
                                            <div key={game.appid} style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                                <div style={{width:'20px', color: index===0?'#E50914':'#888', fontWeight:'bold'}}>{index+1}</div>
                                                <img src={iconUrl} alt="" style={{width:'32px', height:'32px', borderRadius:'4px'}} onError={(e)=>e.target.style.display='none'}/>
                                                <div style={{flex:1}}>
                                                    <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px', marginBottom:'5px'}}>
                                                        <span style={{color:'#fff'}}>{game.name}</span>
                                                        <span style={{color:'#aaa'}}>{formatPlaytime(game.playtime_forever)}</span>
                                                    </div>
                                                    <div style={{width:'100%', height:'6px', background:'rgba(255,255,255,0.1)', borderRadius:'3px', overflow:'hidden'}}>
                                                        <div style={{width:`${percent}%`, height:'100%', background: index===0 ? '#E50914' : '#66c0f4'}}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : <div style={{textAlign:'center', color:'#666'}}>분석할 게임 기록이 없습니다.</div>}
                        </div>
                    )}
                </>
            )}
        </div>

        {/* 2. 필터 및 추천 결과 섹션 (항상 표시) */}
        <div>
            <h3 style={{marginBottom:'15px'}}>🎯 태그로 추천 좁히기</h3>
            <div style={{marginBottom:'30px', display:'flex', gap:'8px', flexWrap:'wrap'}}>
                {Object.entries(TAG_CATEGORIES).map(([catName, tags]) => (
                    <React.Fragment key={catName}>
                        {tags.map(tag => (
                            <button key={tag} onClick={() => toggleTag(tag)}
                                style={{
                                    padding:'8px 16px', borderRadius:'20px', border:'1px solid #444',
                                    background: selectedTags.includes(tag) ? '#E50914' : '#222',
                                    color: selectedTags.includes(tag) ? '#fff' : '#ccc', 
                                    cursor:'pointer', transition:'all 0.2s', fontSize:'14px'
                                }}
                            >
                                {tag}
                            </button>
                        ))}
                    </React.Fragment>
                ))}
            </div>

            <h3 style={{marginBottom:'20px'}}>
                {selectedTags.length > 0 ? `'${selectedTags.join(', ')}' 관련 추천` : '✨ 당신을 위한 추천'}
            </h3>

            {loading ? (
                <div className="net-cards">
                    {[1,2,3,4,5].map(n => <Skeleton key={n} height="250px" />)}
                </div>
            ) : (
                <div className="net-cards">
                    {games && games.length > 0 ? games.map(g => (
                        <Link to={`/game/${g.slug}`} key={g.slug} className="net-card">
                            <div className="net-card-thumb">
                                <img src={g.main_image} alt={g.title} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                                {g.score && (
                                    <div style={{position:'absolute', top:'10px', right:'10px', background:'rgba(0,0,0,0.8)', color:'#46d369', padding:'4px 8px', borderRadius:'4px', fontSize:'12px', fontWeight:'bold', border:'1px solid #46d369'}}>
                                        {Math.round(g.score * 100)}% 매칭
                                    </div>
                                )}
                            </div>
                            <div className="net-card-body">
                                <div className="net-card-title" style={{fontSize:'16px', marginBottom:'5px'}}>
                                    {g.title_ko || g.title}
                                </div>
                            </div>
                        </Link>
                    )) : (
                        <div style={{gridColumn:'1/-1', textAlign:'center', padding:'60px', color:'#666', border:'1px dashed #444', borderRadius:'8px'}}>
                            <div style={{fontSize:'40px', marginBottom:'20px'}}>🤔</div>
                            <h3>추천할 게임을 찾지 못했습니다.</h3>
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
  );
}

// 스타일 정의
const styles = {
    statusBox: { backgroundColor:'#181818', padding:'40px', borderRadius:'8px', textAlign:'center', color:'#aaa', border:'1px solid #333' },
    ctaBox: { backgroundColor:'#1b2838', padding:'30px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #333', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' },
    steamButton: { backgroundColor:'#66c0f4', border:'none', padding:'12px 24px', borderRadius:'4px', fontWeight:'bold', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center' },
    dashboard: { backgroundColor:'#1b2838', padding:'30px', borderRadius:'8px', border:'1px solid #2a475e' },
    linkButton: { color:'#66c0f4', textDecoration:'none', fontSize:'14px', marginTop:'10px', display:'inline-block' },
    textButton: { background:'none', border:'1px solid #555', color:'#ccc', padding:'8px 16px', borderRadius:'4px', cursor:'pointer', fontSize:'13px' }
};

export default PersonalRecoPage;
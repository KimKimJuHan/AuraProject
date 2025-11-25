import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import Skeleton from '../Skeleton';

const TAG_CATEGORIES = {
  '장르': ['RPG', 'FPS', '시뮬레이션', '전략', '로그라이크', '소울라이크'],
  '특징': ['오픈 월드', '협동', '스토리 중심', '경쟁']
};

function PersonalRecoPage() {
  const [games, setGames] = useState([]); // 추천 게임 목록
  const [loading, setLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  
  // 스팀 데이터 상태
  const [steamGames, setSteamGames] = useState([]); 
  const [topGames, setTopGames] = useState([]);     
  
  // 상태 관리: LOADING(로딩중), LINKED(연동됨), PRIVATE(비공개), NOT_LINKED(미연동)
  const [steamStatus, setSteamStatus] = useState('LOADING'); 

  const [searchParams] = useSearchParams();
  const urlSteamId = searchParams.get('steamId');

  // 1. 페이지 로드 시: 내 스팀 연동 상태 확인 및 데이터 가져오기
  useEffect(() => {
    checkSteamConnection();
  }, [urlSteamId]); // URL에 steamId가 바뀌면 다시 체크

  const checkSteamConnection = async () => {
    setSteamStatus('LOADING');
    try {
        // 백엔드에 내 게임 목록 요청 (이 요청의 성공/실패로 연동 여부 판단)
        const res = await axios.get('http://localhost:8000/api/user/games', { withCredentials: true });
        
        // 성공 (200 OK) -> 연동됨 & 공개 프로필
        const allGames = res.data || [];
        setSteamGames(allGames);
        
        // 플레이타임 상위 10개 추출
        const sorted = [...allGames].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 10);
        setTopGames(sorted);
        setSteamStatus('LINKED');

        // (선택사항) 만약 URL이나 로컬스토리지에 ID가 없었다면 업데이트 해줄 수도 있음

    } catch (err) {
        // 실패 원인 분석
        if (err.response?.status === 403 && err.response?.data?.errorCode === 'PRIVATE_PROFILE') {
            // 연동은 됐는데 비공개임
            setSteamStatus('PRIVATE');
        } else if (err.response?.status === 400 || err.response?.status === 401) {
            // 연동 안 됨 (토큰 없거나 스팀 ID 없음)
            setSteamStatus('NOT_LINKED');
        } else {
            console.error("스팀 확인 중 에러:", err);
            setSteamStatus('NOT_LINKED'); // 기타 에러 시 일단 연동 버튼 보여줌
        }
    }
  };

  // 2. AI 추천 게임 가져오기 (충돌 해결된 부분)
  const fetchRecommendations = async () => {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('user'));
      try {
        const res = await axios.post('http://localhost:8000/api/ai-recommend/personal', { 
            userId: user?.id || user?._id,
            tags: selectedTags,
            // steamStatus가 LINKED나 PRIVATE이면 연동된 것으로 간주
            steamId: (steamStatus === 'LINKED' || steamStatus === 'PRIVATE') ? 'LINKED' : '' 
        });
        
        // ★★★ [수정] 백엔드가 { games: [...] } 형태로 주므로 .games를 붙여야 함!
        setGames(res.data.games || []); 

      } catch (err) { 
          console.error(err); 
          setGames([]); // 에러 시 빈 배열
      } finally { 
          setLoading(false); 
      }
  };

  useEffect(() => { 
      // 태그가 바뀌거나 스팀 상태가 확정되면 추천 다시 받기
      if (steamStatus !== 'LOADING') {
          fetchRecommendations(); 
      }
  }, [selectedTags, steamStatus]);

  const toggleTag = (tag) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleLinkSteam = () => {
      window.location.href = 'http://localhost:8000/api/auth/steam?link=true';
  };

  return (
    <div className="net-panel">
        <h2 className="net-section-title" style={{borderLeftColor:'#E50914'}}>🤖 AI 맞춤 추천</h2>

        {/* ========================================================= */}
        {/* 스팀 상태별 UI (자동 감지) */}
        {/* ========================================================= */}
        <div style={{marginBottom:'40px'}}>
            
            {/* 1. 로딩 중 */}
            {steamStatus === 'LOADING' && (
                <div style={{color:'#aaa', padding:'20px', textAlign:'center', backgroundColor:'#1b2838', borderRadius:'8px'}}>
                    <i className="fas fa-spinner fa-spin"></i> 스팀 라이브러리 정보를 확인하고 있습니다...
                </div>
            )}

            {/* 2. 미연동 상태 -> 연동 버튼 표시 */}
            {steamStatus === 'NOT_LINKED' && (
                <div style={{backgroundColor:'#1b2838', padding:'20px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                    <div>
                        <span style={{color:'#fff', fontWeight:'bold', display:'block', fontSize:'16px'}}>내 스팀 라이브러리 연동하기</span>
                        <span style={{color:'#aaa', fontSize:'13px'}}>플레이 기록을 분석하여 더 정확한 게임을 추천해드립니다.</span>
                    </div>
                    <button onClick={handleLinkSteam} style={{backgroundColor:'#66c0f4', border:'none', padding:'10px 20px', borderRadius:'4px', fontWeight:'bold', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', gap:'8px'}}>
                        <i className="fa-brands fa-steam"></i> Steam 계정 연동
                    </button>
                </div>
            )}

            {/* 3. 비공개 프로필 에러 -> 빨간 박스 */}
            {steamStatus === 'PRIVATE' && (
                <div style={{backgroundColor:'#3a1d1d', border:'1px solid #ff4444', padding:'20px', borderRadius:'8px', display:'flex', flexDirection:'column', gap:'10px'}}>
                    <div style={{color:'#ff4444', fontWeight:'bold', fontSize:'16px'}}>
                        ⚠️ 스팀 프로필이 비공개 상태입니다.
                    </div>
                    <div style={{color:'#ccc', fontSize:'14px'}}>
                        연동은 성공했으나 데이터를 가져올 수 없습니다. <br/>
                        스팀 설정에서 <strong>'게임 세부 정보'</strong>를 <strong>'공개(Public)'</strong>로 변경해주세요.
                    </div>
                    <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noreferrer" 
                       style={{width:'fit-content', backgroundColor:'#ff4444', color:'white', padding:'8px 16px', borderRadius:'4px', textDecoration:'none', fontSize:'13px'}}>
                        스팀 공개 설정 바로가기
                    </a>
                    <button onClick={checkSteamConnection} style={{width:'fit-content', marginTop:'10px', background:'none', border:'1px solid #ccc', color:'#ccc', padding:'5px 10px', borderRadius:'4px', cursor:'pointer'}}>
                        🔄 설정 변경 후 다시 시도하기
                    </button>
                </div>
            )}

            {/* 4. 연동 성공 -> 통계 그래프 */}
            {steamStatus === 'LINKED' && topGames.length > 0 && (
                <div style={{backgroundColor:'#1b2838', padding:'25px', borderRadius:'8px'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                        <h3 style={{color:'#66c0f4', margin:0, fontSize:'18px'}}>
                            <i className="fas fa-chart-bar" style={{marginRight:'8px'}}></i>
                            내 플레이타임 TOP 10
                        </h3>
                        <span style={{color:'#888', fontSize:'12px'}}>총 {steamGames.length}개의 게임 분석됨</span>
                    </div>

                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                        {topGames.map((game, index) => {
                            const maxTime = topGames[0].playtime_forever;
                            const percent = (game.playtime_forever / maxTime) * 100;
                            const hours = Math.floor(game.playtime_forever / 60);

                            return (
                                <div key={game.appid} style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                    <div style={{width:'20px', color:'#66c0f4', fontWeight:'bold', textAlign:'center'}}>{index + 1}</div>
                                    <img src={`http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`} 
                                         alt="" style={{width:'32px', height:'32px', borderRadius:'4px'}} 
                                         onError={(e) => e.target.style.display='none'} 
                                    />
                                    <div style={{flex:1}}>
                                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'4px', fontSize:'13px'}}>
                                            <span style={{color:'white'}}>{game.name}</span>
                                            <span style={{color:'#aaa'}}>{hours}시간</span>
                                        </div>
                                        <div style={{width:'100%', height:'8px', backgroundColor:'rgba(255,255,255,0.1)', borderRadius:'4px', overflow:'hidden'}}>
                                            <div style={{
                                                width: `${percent}%`, 
                                                height:'100%', 
                                                backgroundColor: index === 0 ? '#E50914' : '#66c0f4',
                                                borderRadius:'4px'
                                            }}></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>

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

        {/* 결과 리스트 (충돌 방지됨) */}
        {loading ? <Skeleton height="300px" /> : (
            <div className="net-cards">
                {games && games.length > 0 ? games.map(g => (
                    <Link to={`/game/${g.slug}`} key={g.slug} className="net-card">
                        <div className="net-card-thumb"><img src={g.main_image} alt=""/></div>
                        <div className="net-card-body">
                            <div className="net-card-title">{g.title_ko || g.title}</div>
                            <div className="net-card-footer">
                                <span style={{color:'#46d369'}}>{Math.round((g.score || 0) * 100)}% 일치</span>
                                {g.trend_score > 500 && <span style={{fontSize:'10px', border:'1px solid red', color:'red', padding:'2px'}}>HOT</span>}
                            </div>
                        </div>
                    </Link>
                )) : (
                    <div style={{color:'#777', padding:'20px'}}>추천할 게임이 없습니다.</div>
                )}
            </div>
        )}
    </div>
  );
}
export default PersonalRecoPage;
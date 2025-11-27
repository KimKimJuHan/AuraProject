import React, { useState, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from 'axios'; 
import "./RecommendPage.css"; 

const TAG_CATEGORIES = {
  '장르': ['RPG', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '액션', '어드벤처'],
  '시점': ['1인칭', '3인칭', '탑다운', '사이드뷰', '쿼터뷰'],
  '그래픽': ['픽셀 그래픽', '2D', '3D', '만화 같은', '현실적', '애니메이션', '귀여운'],
  '테마': ['판타지', '공상과학', '중세', '현대', '우주', '좀비', '사이버펑크', '마법', '전쟁', '포스트아포칼립스'],
  '특징': ['오픈 월드', '자원관리', '스토리 중심', '선택의 중요성', '캐릭터 커스터마이즈', '협동 캠페인', '멀티플레이', '싱글플레이', '로그라이크', '소울라이크']
};

const API_BASE = "http://localhost:8000";

function PersonalRecoPage({ user }) {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(new Set());
  const pickedRef = useRef(new Set());
  const [strict, setStrict] = useState(false);
  const [k, setK] = useState(12);
  
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // 스팀 연동 상태
  const [steamGames, setSteamGames] = useState([]); 
  const [topGames, setTopGames] = useState([]);     
  const [steamStatus, setSteamStatus] = useState('LOADING'); 
  const [searchParams] = useSearchParams();
  const urlSteamId = searchParams.get('steamId');

  useEffect(() => {
    if (user) checkSteamConnection();
    else setSteamStatus('GUEST');
    fetchReco(); // 자동 로딩
  }, [user, urlSteamId]);

  const checkSteamConnection = async () => {
    setSteamStatus('LOADING');
    try {
        const res = await axios.get(`${API_BASE}/api/user/games`, { withCredentials: true });
        setSteamGames(res.data || []);
        const sorted = (res.data || []).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);
        setTopGames(sorted);
        setSteamStatus('LINKED');
    } catch (err) {
        setSteamStatus(err.response?.status === 403 ? 'PRIVATE' : 'NOT_LINKED');
    }
  };

  const toggle = (t) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      pickedRef.current = next;
      return next;
    });
  };

  const fetchReco = async () => {
    if (loading) return;
    setErr("");
    setLoading(true);
    try {
      const liked = Array.from(pickedRef.current);
      const res = await axios.post(`${API_BASE}/api/steam/reco`, { term, liked, strict, k });
      setData(res.data);
      if (!res.data.items?.length) setErr("조건에 맞는 게임이 없습니다.");
    } catch (e) { setErr("데이터 로딩 실패"); } 
    finally { setLoading(false); }
  };

  const handleLinkSteam = () => { window.location.href = `${API_BASE}/api/auth/steam?link=true`; };
  const formatTime = (m) => m < 60 ? `${m}분` : `${Math.floor(m/60)}시간`;

  return (
    <div className="reco-container">
      <div className="search-panel">
        <h1>🤖 AI 맞춤 추천</h1>
        
        {/* 스팀 대시보드 */}
        <div className="steam-dashboard">
            {!user ? (
                <div className="steam-guest-msg">
                    <span>로그인하고 내 스팀 게임 기록을 분석받아보세요!</span>
                    <Link to="/login" className="search-btn">로그인</Link>
                </div>
            ) : (
                <>
                    {steamStatus === 'NOT_LINKED' && (
                        <div className="steam-connect-box">
                            <span>스팀 계정을 연동하면 더 정확한 추천을 받습니다.</span>
                            <button onClick={handleLinkSteam} className="search-btn">🎮 Steam 연동</button>
                        </div>
                    )}
                    {steamStatus === 'LINKED' && (
                        <>
                            <div className="steam-header"><h3 style={{color:'#46d369'}}>✅ {user.username}님의 TOP 5</h3></div>
                            <div className="steam-list">
                                {topGames.map((g, i) => (
                                    <div key={i} className="steam-card">
                                        <img src={`http://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`} className="steam-game-icon" alt="" onError={(e)=>e.target.src="https://via.placeholder.com/32"}/>
                                        <div className="steam-info-col">
                                            <div className="steam-game-name" title={g.name}>{g.name}</div>
                                            <div className="steam-playtime">{formatTime(g.playtime_forever)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>

        <div className="search-row">
          <input className="search-input" value={term} onChange={(e)=>setTerm(e.target.value)} placeholder="게임 제목 검색..." onKeyPress={(e)=>e.key==='Enter'&&fetchReco()}/>
          <button className="search-btn" onClick={fetchReco}>검색</button>
        </div>
        
        <div className="tags-panel">
            {Object.entries(TAG_CATEGORIES).map(([group, list]) => (
                <div className="tag-group" key={group}>
                    <div className="tag-label">{group}</div>
                    <div className="tag-list">
                        {list.map(t => (
                            <div key={t} className={`tag-chip ${picked.has(t)?'on':''}`} onClick={()=>toggle(t)}>{t}</div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* 결과 리스트 */}
      {!loading && data?.items && (
        <div className="result-panel">
          <h2>✨ 추천 결과 ({data.items.length}개)</h2>
          <div className="game-grid">
            {data.items.map((g, i) => (
              <Link to={`/game/${g.slug}`} key={i} className="game-card">
                <img src={g.thumb} className="thumb" alt="" />
                <div className="card-info">
                  <div className="game-title">{g.name}</div>
                  <div className="game-meta-row">
                    <span className="game-price">{g.price}</span>
                    <span className="game-playtime">⏳ {g.playtime}</span>
                  </div>
                  <div className="score-bar"><div style={{width:`${g.score}%`}}></div></div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {loading && <div className="loading-box">🔮 분석 중...</div>}
      {err && <div className="error-box">{err}</div>}
    </div>
  );
}

export default PersonalRecoPage;
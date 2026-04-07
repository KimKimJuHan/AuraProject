import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { safeLocalStorage } from '../utils/storage';
import '../styles/Recommend.css';

const AVAILABLE_TAGS = ['액션', 'RPG', '오픈월드', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '어드벤처', '로그라이크', '사이버펑크'];

function MyPage({ user, setUser }) {
    const [wishlistGames, setWishlistGames] = useState([]);
    const [steamInfo, setSteamInfo] = useState({ linked: false, games: [] });
    const [isEditingTags, setIsEditingTags] = useState(false);
    const [currentTags, setCurrentTags] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        setCurrentTags(user.likedTags?.length > 0 ? user.likedTags : ['액션', 'RPG', '오픈월드']);
        fetchData();
    }, [user, navigate]);

    const fetchData = async () => {
        try {
            const wishlist = JSON.parse(safeLocalStorage.getItem('gameWishlist') || "[]");
            if (wishlist.length > 0) {
                const res = await axios.post(`${API_BASE_URL}/api/recommend/wishlist`, { slugs: wishlist }, { withCredentials: true });
                setWishlistGames(res.data.games || []);
            }
            const steamRes = await axios.get(`${API_BASE_URL}/api/user/games`, { withCredentials: true });
            setSteamInfo(steamRes.data);
        } catch (e) { console.error("데이터 로드 실패:", e); }
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm("정말로 계정을 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.")) return;
        try {
            const response = await axios.delete(`${API_BASE_URL}/api/user/account`, { withCredentials: true });
            if (response.data.success) {
                alert("계정이 성공적으로 삭제되었습니다.");
                setUser(null); 
                navigate('/'); 
            }
        } catch (error) { alert("계정 삭제 실패"); }
    };

    const handleLinkSteam = () => {
        window.location.href = `${API_BASE_URL}/api/auth/steam`;
    };

    // ★ 스팀 연동 해제 처리 로직
    const handleUnlinkSteam = async () => {
        if (!window.confirm("스팀 연동을 해제하시겠습니까? 보유 게임 기록이 제거됩니다.")) return;
        try {
            const response = await axios.delete(`${API_BASE_URL}/api/user/steam`, { withCredentials: true });
            if (response.data.message === "해제됨") {
                alert("스팀 연동이 성공적으로 해제되었습니다.");
                setSteamInfo({ linked: false, games: [] }); // UI 즉각 갱신
                fetchData();
            }
        } catch (error) { alert("해제 처리에 실패했습니다."); }
    };

    const toggleTag = (tag) => {
        if (currentTags.includes(tag)) {
            setCurrentTags(currentTags.filter(t => t !== tag));
        } else {
            if (currentTags.length >= 5) return alert("선호 태그는 최대 5개까지만 선택할 수 있습니다.");
            setCurrentTags([...currentTags, tag]);
        }
    };

    const handleSaveTags = async () => {
        try {
            await axios.post(`${API_BASE_URL}/api/user/tags`, { tags: currentTags }, { withCredentials: true });
            alert("선호 태그가 성공적으로 저장되었습니다.");
            setUser({ ...user, likedTags: currentTags });
            setIsEditingTags(false);
        } catch (error) { alert("태그 저장에 실패했습니다."); }
    };

    return (
        <div className="reco-container" style={{maxWidth:'1000px', margin:'40px auto', padding:'0 20px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom:'2px solid #333', paddingBottom:'10px'}}>
                <h1 style={{color:'#e50914', margin: 0}}>👤 마이페이지</h1>
                <button onClick={handleDeleteAccount} style={{backgroundColor: 'transparent', border: '1px solid #666', color: '#888', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'}}>
                    계정 탈퇴
                </button>
            </div>
            
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginTop:'20px'}}>
                <div className="search-panel">
                    <h3>내 계정 정보</h3>
                    {user?.avatar && <img src={user.avatar} alt="프로필" style={{width:'50px', height:'50px', borderRadius:'50%', marginBottom:'10px'}} />}
                    <p><b>이름(닉네임):</b> {user?.displayName || user?.username}</p>
                    <p><b>이메일:</b> {user?.email || "정보 없음"}</p>
                    <button className="search-btn" style={{marginTop:'10px'}} onClick={() => alert("비밀번호 변경 화면은 현재 구현 중입니다.")}>
                        비밀번호 변경
                    </button>
                </div>

                <div className="search-panel">
                    <h3>🎮 스팀 연동 상태</h3>
                    {steamInfo.linked ? (
                        <div>
                            <p style={{color:'#4CAF50'}}>✅ 연동 완료</p>
                            <p>보유 게임: {steamInfo.games.length}개</p>
                            {/* ★ 맞춤 추천과 연동 해제 버튼 동시 배치 */}
                            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                                <button onClick={() => navigate('/recommend/personal')} className="search-btn" style={{flex: 1}}>맞춤 추천 보기</button>
                                <button onClick={handleUnlinkSteam} className="search-btn" style={{backgroundColor:'#e50914', flex: 1}}>연동 해제</button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <p style={{color:'#888'}}>연동된 계정이 없습니다.</p>
                            <button onClick={handleLinkSteam} className="search-btn" style={{backgroundColor:'#666'}}>스팀 계정 연결</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="search-panel" style={{marginTop:'20px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <h3 style={{margin: 0}}>🏷️ 나의 선호 태그</h3>
                    {isEditingTags ? (
                        <div>
                            <button onClick={handleSaveTags} style={{background:'#e50914', border:'none', color:'#fff', padding:'5px 12px', borderRadius:'4px', marginRight:'5px', cursor:'pointer'}}>저장</button>
                            <button onClick={() => { setIsEditingTags(false); setCurrentTags(user?.likedTags || ['액션', 'RPG', '오픈월드']); }} style={{background:'#666', border:'none', color:'#fff', padding:'5px 12px', borderRadius:'4px', cursor:'pointer'}}>취소</button>
                        </div>
                    ) : (
                        <button onClick={() => setIsEditingTags(true)} style={{background:'none', border:'1px dashed #666', color:'#ccc', padding:'5px 12px', borderRadius:'15px', cursor:'pointer'}}>+ 수정</button>
                    )}
                </div>

                {isEditingTags ? (
                    <div style={{display:'flex', gap:'10px', flexWrap:'wrap', marginTop:'15px'}}>
                        {AVAILABLE_TAGS.map(tag => {
                            const isSelected = currentTags.includes(tag);
                            return (
                                <span 
                                    key={tag} 
                                    onClick={() => toggleTag(tag)}
                                    style={{
                                        background: isSelected ? '#e50914' : '#333',
                                        color: isSelected ? '#fff' : '#888',
                                        padding: '5px 12px', 
                                        borderRadius: '15px', 
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}>
                                    #{tag}
                                </span>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{display:'flex', gap:'10px', flexWrap:'wrap', marginTop:'15px'}}>
                        {currentTags.map(tag => (
                            <span key={tag} style={{background:'#333', padding:'5px 12px', borderRadius:'15px', fontSize:'13px', color:'#fff'}}>#{tag}</span>
                        ))}
                    </div>
                )}
            </div>

            <div className="result-panel" style={{marginTop:'20px'}}>
                <h3>❤️ 나의 찜 목록 ({wishlistGames.length})</h3>
                <div className="game-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'15px'}}>
                    {wishlistGames.map(game => (
                        <div key={game._id} className="game-card" onClick={() => navigate(`/game/${game.slug}`)}>
                            <img src={game.main_image} alt={game.title} style={{width:'100%', borderRadius:'4px'}} />
                            <div style={{padding:'10px'}}>
                                <div style={{fontSize:'14px', fontWeight:'bold'}} className="text-truncate">{game.title_ko || game.title}</div>
                                <div style={{fontSize:'12px', color:'#e50914', marginTop:'5px'}}>
                                    {game.price_info?.current_price > 0 ? `${game.price_info.current_price.toLocaleString()}원` : '무료'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default MyPage;
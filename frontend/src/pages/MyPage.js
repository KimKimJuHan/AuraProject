import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL, apiClient } from '../config';
import { safeLocalStorage } from '../utils/storage';
import PcCompatibilityBadge from '../components/PcCompatibilityBadge';
import { CPU_OPTIONS } from '../data/hardware/cpuScores';
import { GPU_OPTIONS } from '../data/hardware/gpuScores';
import { savePcSpec, removePcSpec, getSavedPcSpec } from '../utils/pcCompatibility';
import '../styles/Recommend.css';
import { useTheme } from '../context/ThemeContext';

const AVAILABLE_TAGS = ['액션', 'RPG', '오픈월드', 'FPS', '시뮬레이션', '전략', '스포츠', '레이싱', '퍼즐', '생존', '공포', '어드벤처', '로그라이크', '사이버펑크'];

function MyPage({ user, setUser }) {
    const [wishlistGames, setWishlistGames] = useState([]);
    const [steamInfo, setSteamInfo] = useState({ linked: false, games: [] });
    const { theme, toggleTheme } = useTheme();
    const [isEditingTags, setIsEditingTags] = useState(false);
    const [currentTags, setCurrentTags] = useState([]);
    const navigate = useNavigate();
    const [isEditingNickname, setIsEditingNickname] = useState(false);
    const [newDisplayName, setNewDisplayName] = useState('');
    const [pcSpecForm, setPcSpecForm] = useState({ cpuName: '', gpuName: '', ram: 16 });
    const [savedPcSpec, setSavedPcSpec] = useState(null);
    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [pwError, setPwError] = useState('');
    const [notifSaved, setNotifSaved] = useState(false);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        setCurrentTags(user.likedTags?.length > 0 ? user.likedTags : ['액션', 'RPG', '오픈월드']);
        setNewDisplayName(user?.displayName || user?.username || '');
        const savedSpec = getSavedPcSpec();
        setSavedPcSpec(savedSpec);
        if (savedSpec) {
            setPcSpecForm({
                cpuName: savedSpec.cpuName || '',
                gpuName: savedSpec.gpuName || '',
                ram: savedSpec.ram || 16
            });
        }
        fetchData();
    }, [user, navigate]);

    const fetchData = async () => {
        try {
            // [수정] localStorage 대신 DB에서 찜 목록 slug 배열 조회 후 게임 정보 요청
            const wlRes = await apiClient.get('/user/wishlist');
            const slugs = wlRes.data || [];
            if (slugs.length > 0) {
                const res = await apiClient.post('/recommend/wishlist', { slugs });
                setWishlistGames(res.data.games || []);
            } else {
                setWishlistGames([]);
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

    const handleSavePlayerType = async (newType) => {
        try {
            await apiClient.put('/user/playerType', { playerType: newType });
            if (setUser) setUser(prev => ({ ...prev, playerType: newType, playerTypeSetByUser: true }));
        } catch { alert('저장 실패'); }
    };

    const handleLinkSteam = () => {
        window.location.href = `${API_BASE_URL}/api/auth/steam`;
    };

    const handleUnlinkSteam = async () => {
        if (!window.confirm("스팀 연동을 해제하시겠습니까? 보유 게임 기록이 제거됩니다.")) return;
        try {
            const response = await axios.delete(`${API_BASE_URL}/api/user/steam`, { withCredentials: true });
            if (response.data.message === "해제됨") {
                alert("스팀 연동이 성공적으로 해제되었습니다.");
                setSteamInfo({ linked: false, games: [] });
                fetchData();
            }
        } catch (error) { alert("해제 처리에 실패했습니다."); }
    };

    const toggleTag = (tag) => {
        if (currentTags.includes(tag)) {
            setCurrentTags(currentTags.filter(t => t !== tag));
        } else {
            // 태그 제한 없음
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

    const handleSaveNickname = async () => {
      const value = String(newDisplayName || '').trim();
      if (!value) return alert('닉네임을 입력해주세요.');
      if (value.length < 2 || value.length > 20) return alert('닉네임은 2~20자로 입력해주세요.');

      try {
        const res = await axios.patch(
          `${API_BASE_URL}/api/user/me/displayName`,
          { displayName: value },
          { withCredentials: true }
        );

        const updatedUser = res.data;

        setUser(updatedUser);
        safeLocalStorage.setItem('user', JSON.stringify(updatedUser));

        alert('닉네임이 변경되었습니다.');
        setIsEditingNickname(false);
      } catch (e) {
        alert(e?.response?.data?.message || '닉네임 변경 실패');
      }
    };

    const handleSavePcSpec = () => {
        const selectedCpu = CPU_OPTIONS.find(cpu => cpu.name === pcSpecForm.cpuName);
        const selectedGpu = GPU_OPTIONS.find(gpu => gpu.name === pcSpecForm.gpuName);

        if (!selectedCpu) return alert('CPU를 선택해주세요.');
        if (!selectedGpu) return alert('그래픽카드를 선택해주세요.');

        const nextSpec = {
            cpuName: selectedCpu.name,
            cpuScore: selectedCpu.score,
            gpuName: selectedGpu.name,
            gpuScore: selectedGpu.score,
            ram: Number(pcSpecForm.ram)
        };

        savePcSpec(nextSpec);
    window.dispatchEvent(new Event('pcSpecUpdated'));
        setSavedPcSpec(nextSpec);
        alert('PC 사양이 저장되었습니다.');
    };

    const handleRemovePcSpec = () => {
        if (!window.confirm('저장된 PC 사양을 삭제하시겠습니까?')) return;
        removePcSpec();
        setSavedPcSpec(null);
        setPcSpecForm({ cpuName: '', gpuName: '', ram: 16 });
        alert('PC 사양이 삭제되었습니다.');
    };

    return (
        <div className="reco-container" style={{maxWidth:'1000px', margin:'40px auto', padding:'0 20px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom:'2px solid #333', paddingBottom:'10px'}}>
                <h1 style={{color:'#e50914', margin: 0}}>👤 마이페이지</h1>
                <button onClick={handleDeleteAccount} style={{backgroundColor: 'transparent', border: '1px solid #666', color: '#888', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'}}>
                    계정 탈퇴
                </button>
            </div>

            <div className="mypage-grid" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginTop:'20px'}}>
                <div className="search-panel mypage-card">
                    <h3>내 계정 정보</h3>
                    {user?.avatar && <img src={user.avatar} alt="프로필" style={{width:'50px', height:'50px', borderRadius:'50%', marginBottom:'10px'}} />}
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '38px' }}>
                        {isEditingNickname ? (
                          <>
                            <input
                              value={newDisplayName}
                              onChange={(e) => setNewDisplayName(e.target.value)}
                              placeholder="새 닉네임 (2~20자)"
                              style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#fff', fontSize: '14px' }}
                            />
                            <button onClick={handleSaveNickname} className="search-btn" style={{ whiteSpace: 'nowrap', padding: '7px 12px' }}>저장</button>
                            <button onClick={() => { setIsEditingNickname(false); setNewDisplayName(user?.displayName || user?.username || ''); }} className="search-btn" style={{ backgroundColor: '#666', whiteSpace: 'nowrap', padding: '7px 12px' }}>취소</button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 1 }}><b>닉네임:</b> {user?.displayName || user?.username}</span>
                            <button onClick={() => setIsEditingNickname(true)} className="search-btn" style={{ backgroundColor: '#555', padding: '5px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>변경</button>
                          </>
                        )}
                      </div>
                    </div>
                    <p><b>이메일:</b> {user?.email || "정보 없음"}</p>
                    <button
                      className="search-btn"
                      style={{ marginTop: '10px' }}
                      onClick={() => navigate('/change-password')}
                    >
                      비밀번호 변경
                    </button>
                </div>

                <div className="search-panel mypage-card">
                    <h3>🎮 스팀 연동 상태</h3>
                    {steamInfo.linked ? (
                        <div>
                            <p style={{color:'#4CAF50'}}>✅ 연동 완료</p>
                            <p>보유 게임: {steamInfo.games.length}개</p>
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
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap'}}>
                    <h3 style={{margin: 0}}>🖥️ 내 PC 사양 설정</h3>
                    {savedPcSpec && (
                        <span style={{fontSize:'12px', color:'#4CAF50', fontWeight:'bold'}}>저장됨</span>
                    )}
                </div>

                <p style={{fontSize:'13px', color:'#aaa', lineHeight:1.5, marginTop:'10px'}}>
                     저장 후 게임 카드에 호환 여부가 표시됩니다.
                </p>

                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'12px', marginTop:'15px'}}>
                    <label style={{display:'flex', flexDirection:'column', gap:'6px', color:'#ddd', fontSize:'13px'}}>
                        CPU
                        <select
                            value={pcSpecForm.cpuName}
                            onChange={(e) => setPcSpecForm(prev => ({ ...prev, cpuName: e.target.value }))}
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid #444', background:'#111', color:'#fff'}}
                        >
                            <option value="">CPU 선택</option>
                            {CPU_OPTIONS.map(cpu => (
                                <option key={cpu.name} value={cpu.name}>{cpu.name}</option>
                            ))}
                        </select>
                    </label>

                    <label style={{display:'flex', flexDirection:'column', gap:'6px', color:'#ddd', fontSize:'13px'}}>
                        그래픽카드
                        <select
                            value={pcSpecForm.gpuName}
                            onChange={(e) => setPcSpecForm(prev => ({ ...prev, gpuName: e.target.value }))}
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid #444', background:'#111', color:'#fff'}}
                        >
                            <option value="">그래픽카드 선택</option>
                            {GPU_OPTIONS.map(gpu => (
                                <option key={gpu.name} value={gpu.name}>{gpu.name}</option>
                            ))}
                        </select>
                    </label>

                    <label style={{display:'flex', flexDirection:'column', gap:'6px', color:'#ddd', fontSize:'13px'}}>
                        RAM
                        <select
                            value={pcSpecForm.ram}
                            onChange={(e) => setPcSpecForm(prev => ({ ...prev, ram: Number(e.target.value) }))}
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid #444', background:'#111', color:'#fff'}}
                        >
                            {[4, 8, 12, 16, 24, 32, 64].map(ram => (
                                <option key={ram} value={ram}>{ram}GB</option>
                            ))}
                        </select>
                    </label>
                </div>

                {savedPcSpec && (
                    <div style={{marginTop:'12px', padding:'10px', background:'#111', border:'1px solid #333', borderRadius:'6px', color:'#ccc', fontSize:'13px', lineHeight:1.6}}>
                        현재 저장 사양: {savedPcSpec.cpuName} / {savedPcSpec.gpuName} / RAM {savedPcSpec.ram}GB
                    </div>
                )}

                <div style={{display:'flex', gap:'10px', marginTop:'15px', flexWrap:'wrap'}}>
                    <button onClick={handleSavePcSpec} className="search-btn">PC 사양 저장</button>
                    {savedPcSpec && (
                        <button onClick={handleRemovePcSpec} className="search-btn" style={{backgroundColor:'#666'}}>삭제</button>
                    )}
                </div>
            </div>



            {/* 화면 테마 */}
            <div className="search-panel" style={{marginTop:'20px'}}>
                <h3 style={{margin:'0 0 12px 0'}}>🎨 화면 테마</h3>
                <div style={{display:'flex', gap:'10px'}}>
                    <div onClick={() => theme === 'dark' ? null : toggleTheme()}
                        style={{
                            flex:1, padding:'14px', borderRadius:'8px', cursor:'pointer',
                            border: theme === 'dark' ? '2px solid #e50914' : '1px solid #333',
                            background: theme === 'dark' ? 'rgba(229,9,20,0.08)' : 'transparent',
                            textAlign:'center', transition:'all 0.15s'
                        }}>
                        <div style={{fontSize:'24px', marginBottom:'6px'}}>🌙</div>
                        <div style={{fontSize:'13px', fontWeight: theme === 'dark' ? '700' : '400'}}>다크 모드</div>
                        <div style={{fontSize:'11px', color:'#666', marginTop:'2px'}}>기본 설정</div>
                    </div>
                    <div onClick={() => theme === 'light' ? null : toggleTheme()}
                        style={{
                            flex:1, padding:'14px', borderRadius:'8px', cursor:'pointer',
                            border: theme === 'light' ? '2px solid #e50914' : '1px solid #333',
                            background: theme === 'light' ? 'rgba(229,9,20,0.08)' : 'transparent',
                            textAlign:'center', transition:'all 0.15s'
                        }}>
                        <div style={{fontSize:'24px', marginBottom:'6px'}}>☀️</div>
                        <div style={{fontSize:'13px', fontWeight: theme === 'light' ? '700' : '400'}}>라이트 모드</div>
                        <div style={{fontSize:'11px', color:'#666', marginTop:'2px'}}>밝은 화면</div>
                    </div>
                </div>
            </div>

            {/* 게이머 성향 */}
            <div className="search-panel" style={{marginTop:'20px'}}>
                <h3 style={{margin:'0 0 10px 0'}}>🎮 게이머 성향</h3>
                <p style={{color:'#888', fontSize:'12px', marginBottom:'12px', marginTop:0}}>
                    선택한 성향에 맞게 게임을 추천해 드립니다. 언제든 변경 가능합니다.
                </p>
                <div style={{display:'flex', flexDirection:'column', gap:'7px'}}>
                    {[
                        { key:'casual',       label:'가볍게 즐기는 편',          desc:'힐링, 캐주얼, 퍼즐 위주 추천' },
                        { key:'beginner',     label:'게임을 즐겨 하는 편',        desc:'인기 게임 + 취향 태그 기반 추천' },
                        { key:'intermediate', label:'다양한 장르를 즐기는 편',    desc:'트렌드 + 플레이 이력 균형 추천' },
                        { key:'hardcore',     label:'도전적인 게임을 즐기는 편',  desc:'플레이 이력 기반 심화 게임 추천' },
                        { key:'streamer',     label:'스트리머 / 크리에이터',      desc:'치지직·SOOP·Twitch 트렌드 위주 추천' },
                    ].map(({ key, label, desc }) => {
                        const sel = user?.playerType === key;
                        return (
                            <div key={key} onClick={() => handleSavePlayerType(key)} style={{
                                display:'flex', alignItems:'center', gap:'12px', cursor:'pointer',
                                padding:'10px 14px', borderRadius:'8px',
                                border: sel ? '2px solid #e50914' : '1px solid #333',
                                background: sel ? 'rgba(229,9,20,0.08)' : 'transparent',
                                transition:'all 0.15s'
                            }}>
                                <div style={{
                                    width:'16px', height:'16px', borderRadius:'50%', flexShrink:0,
                                    border:`2px solid ${sel ? '#e50914' : '#555'}`,
                                    background: sel ? '#e50914' : 'transparent',
                                    display:'flex', alignItems:'center', justifyContent:'center'
                                }}>
                                    {sel && <div style={{width:'5px', height:'5px', borderRadius:'50%', background:'#fff'}}/>}
                                </div>
                                <div>
                                    <div style={{color:'#fff', fontSize:'13px', fontWeight: sel ? '700' : '400'}}>{label}</div>
                                    <div style={{color:'#666', fontSize:'11px', marginTop:'2px'}}>{desc}</div>
                                </div>
                            </div>
                        );
                    })}
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
                  <div className="mypage-tag-grid" style={{display:'flex', gap:'10px', flexWrap:'wrap', marginTop:'15px'}}>
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
                    <div className="mypage-tag-grid" style={{display:'flex', gap:'10px', flexWrap:'wrap', marginTop:'15px'}}>
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
                                <PcCompatibilityBadge game={game} compact hideUnknown />

                                {game.reason && (
                                  <div style={{
                                    fontSize:'11px',
                                    color:'#E50914',
                                    marginTop:'6px',
                                    marginBottom:'6px',
                                    lineHeight:'1.3',
                                    fontWeight:'bold',
                                    wordBreak:'keep-all'
                                  }}>
                                    💡 {game.reason}
                                  </div>
                                )}

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
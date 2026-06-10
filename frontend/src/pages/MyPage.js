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
    const [dislikedGames, setDislikedGames] = useState([]);
    const [priceAlerts, setPriceAlerts] = useState([]);
    const [notificationSettings, setNotificationSettings] = useState({ saleAlert: true, newGameAlert: false, emailAlert: true });
    const [isSyncing, setIsSyncing] = useState(false);
    
    const [steamInfo, setSteamInfo] = useState({ linked: false, games: [] });
    const { theme, toggleTheme } = useTheme();
    const [isEditingTags, setIsEditingTags] = useState(false);
    const [currentTags, setCurrentTags] = useState([]);
    const navigate = useNavigate();
    const [isEditingNickname, setIsEditingNickname] = useState(false);
    const [newDisplayName, setNewDisplayName] = useState('');
    const [pcSpecForm, setPcSpecForm] = useState({ cpuName: '', gpuName: '', ram: 0 });
    const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'KRW');
    const [savedPcSpec, setSavedPcSpec] = useState(null);

    const handleCurrencyChange = (newCurrency) => {
        setCurrency(newCurrency);
        localStorage.setItem('currency', newCurrency);
        window.dispatchEvent(new Event('currencyChanged'));
    };


    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        setCurrentTags(user.likedTags?.length > 0 ? user.likedTags : []);
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

            // 스팀 보유 게임 정보 조회
            const steamRes = await axios.get(`${API_BASE_URL}/api/user/games`, { withCredentials: true });
            setSteamInfo(steamRes.data);

            // 관심 없음 게임 목록 조회
            const dlRes = await apiClient.get('/user/disliked');
            const dlSlugs = dlRes.data || [];
            if (dlSlugs.length > 0) {
                const dlData = await apiClient.post('/recommend/wishlist', { slugs: dlSlugs });
                setDislikedGames(dlData.data.games || []);
            } else {
                setDislikedGames([]);
            }

            // 알림 설정 조회
            const notiRes = await apiClient.get('/user/notifications/settings');
            if (notiRes.data) setNotificationSettings(notiRes.data);

            // 목표가 알림 조회
            const alertRes = await apiClient.get('/user/price-alerts');
            if (alertRes.data && alertRes.data.priceAlerts) {
                const alertSlugs = alertRes.data.priceAlerts.map(a => a.slug);
                if (alertSlugs.length > 0) {
                    const alertGamesRes = await apiClient.post('/recommend/wishlist', { slugs: alertSlugs });
                    const enrichedAlerts = alertRes.data.priceAlerts.map(a => {
                        const matchedGame = alertGamesRes.data.games.find(g => g.slug === a.slug);
                        return { ...a, game: matchedGame };
                    });
                    setPriceAlerts(enrichedAlerts);
                } else {
                    setPriceAlerts([]);
                }
            }

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

    const handleSyncSteam = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            await axios.get(`${API_BASE_URL}/api/user/games`, { withCredentials: true });
            alert("스팀 라이브러리가 성공적으로 동기화되었습니다.");
            fetchData();
        } catch (error) {
            alert("동기화에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCancelDislike = async (slug) => {
        try {
            await apiClient.delete(`/user/dislike/${slug}`);
            alert("관심 없음이 취소되어 다시 추천에 표시될 수 있습니다.");
            fetchData();
        } catch (e) {
            alert("취소에 실패했습니다.");
        }
    };

    const handleRemoveFromWishlist = async (slug) => {
        if (!window.confirm("찜 목록에서 삭제하시겠습니까?")) return;
        try {
            await apiClient.delete(`/user/wishlist/${slug}`);
            fetchData();
        } catch (e) {
            alert("삭제에 실패했습니다.");
        }
    };

    const handleUpdateNoti = async (field, value) => {
        const prevSettings = { ...notificationSettings };
        const newSettings = { ...notificationSettings, [field]: value };
        setNotificationSettings(newSettings);
        try {
            await apiClient.put('/user/notifications/settings', newSettings);
        } catch (e) {
            alert("알림 설정 저장에 실패했습니다.");
            setNotificationSettings(prevSettings);
        }
    };

    const handleDeletePriceAlert = async (slug) => {
        if (!window.confirm("이 목표가 알림을 삭제하시겠습니까?")) return;
        try {
            await apiClient.delete(`/user/price-alert/${slug}`);
            alert("알림이 삭제되었습니다.");
            fetchData();
        } catch (e) {
            alert("알림 삭제에 실패했습니다.");
        }
    };

    const toggleTag = (tag) => {
        if (currentTags.includes(tag)) {
            setCurrentTags(currentTags.filter(t => t !== tag));
        } else {
            if (currentTags.length >= 5) return alert('선호 태그는 최대 5개까지 선택할 수 있습니다.');
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
        setPcSpecForm({ cpuName: '', gpuName: '', ram: 0 });
        alert('PC 사양이 삭제되었습니다.');
    };

    return (
        <div className="reco-container" style={{maxWidth:'1000px', margin:'40px auto', padding:'0 20px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom:'2px solid #333', paddingBottom:'10px'}}>
                <h1 style={{color:'#e50914', margin: 0}}>마이페이지</h1>
                <button onClick={handleDeleteAccount} style={{backgroundColor: 'transparent', border: '1px solid #666', color: '#888', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'}}>
                    계정 탈퇴
                </button>
            </div>

            <div className="mypage-grid" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'20px', marginTop:'20px', minWidth:0}}>
                <div className="search-panel mypage-card" style={{minWidth:0, overflow:'hidden'}}>
                    <h3>내 계정 정보</h3>
                    {user?.avatar && <img src={user.avatar} alt="프로필" style={{width:'50px', height:'50px', borderRadius:'50%', marginBottom:'10px'}} />}
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '38px', width: '100%' }}>
                        {isEditingNickname ? (
                          <>
                            <input
                              value={newDisplayName}
                              onChange={(e) => setNewDisplayName(e.target.value)}
                              placeholder="새 닉네임 (2~20자)"
                              style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: '14px', width: '100%' }}
                            />
                            <button onClick={handleSaveNickname} className="search-btn" style={{ padding: '7px 12px', flexShrink: 0 }}>저장</button>
                            <button onClick={() => { setIsEditingNickname(false); setNewDisplayName(user?.displayName || user?.username || ''); }} className="search-btn" style={{ backgroundColor: '#666', padding: '7px 12px', flexShrink: 0 }}>취소</button>
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
                    {!user?.isSocial && (
                      <button
                        className="search-btn"
                        style={{ marginTop: '10px' }}
                        onClick={() => navigate('/change-password')}
                      >
                        비밀번호 변경
                      </button>
                    )}
                    {user?.isSocial && (
                      <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        소셜 로그인 계정은 비밀번호 변경이 필요 없습니다.
                      </p>
                    )}
                </div>

                <div className="search-panel mypage-card">
                    <h3>스팀 연동 상태</h3>
                    {steamInfo.linked ? (
                        <div>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <p style={{color:'#4CAF50', margin:0}}>연동 완료</p>
                                <button onClick={handleSyncSteam} disabled={isSyncing} className="search-btn" style={{padding:'4px 10px', fontSize:'12px', background: isSyncing ? '#555' : 'transparent', border:'1px solid #666', color:'#ccc'}}>
                                    {isSyncing ? '동기화 중...' : '수동 동기화'}
                                </button>
                            </div>
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

            <div className="search-panel mypage-card" style={{marginTop:'20px', minWidth:0, overflow:'hidden'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap'}}>
                    <h3 style={{margin: 0}}>내 PC 사양 설정</h3>
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
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-primary)'}}
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
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-primary)'}}
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
                            style={{padding:'10px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--bg-hover)', color:'var(--text-primary)'}}
                        >
                            <option value={0}>선택</option>
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
            <div className="search-panel mypage-card" style={{marginTop:'20px', minWidth:0, overflow:'hidden'}}>
                <h3 style={{margin:'0 0 12px 0'}}>화면 테마</h3>
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

            {/* 통화 설정 */}
            <div className="search-panel mypage-card" style={{marginTop:'20px', minWidth:0, overflow:'hidden'}}>
                <h3 style={{margin:'0 0 12px 0'}}>통화 설정</h3>
                <p style={{color:'#888', fontSize:'12px', marginBottom:'12px', marginTop:0}}>
                    게임 가격을 표시할 통화를 선택하세요.
                </p>
                <div style={{display:'flex', gap:'10px'}}>
                    {[
                        { code:'KRW', label:'🇰🇷 원화', sub:'KRW' },
                        { code:'USD', label:'🇺🇸 달러', sub:'USD' },
                        { code:'JPY', label:'🇯🇵 엔화', sub:'JPY' },
                    ].map(c => (
                        <div key={c.code} onClick={() => handleCurrencyChange(c.code)}
                            style={{
                                flex:1, padding:'14px', borderRadius:'8px', cursor:'pointer',
                                border: currency === c.code ? '2px solid #e50914' : '1px solid var(--border)',
                                background: currency === c.code ? 'rgba(229,9,20,0.08)' : 'transparent',
                                textAlign:'center', transition:'all 0.15s'
                            }}>
                            <div style={{fontSize:'20px', marginBottom:'4px'}}>{c.label.split(' ')[0]}</div>
                            <div style={{fontSize:'13px', fontWeight: currency === c.code ? '700' : '400'}}>{c.label.split(' ')[1]}</div>
                            <div style={{fontSize:'11px', color:'#666', marginTop:'2px'}}>{c.sub}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 게이머 성향 */}
            <div className="search-panel mypage-card" style={{marginTop:'20px', minWidth:0, overflow:'hidden'}}>
                <h3 style={{margin:'0 0 10px 0'}}>게이머 성향</h3>
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
                                    <div style={{color:'var(--text-primary)', fontSize:'13px', fontWeight: sel ? '700' : '400'}}>{label}</div>
                                    <div style={{color:'#666', fontSize:'11px', marginTop:'2px'}}>{desc}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="search-panel mypage-card" style={{marginTop:'20px', minWidth:0, boxSizing:'border-box', overflow:'hidden'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'}}>
                    <h3 style={{margin: 0}}>나의 선호 태그</h3>
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
                                        transition: 'all 0.2s',
                                        wordBreak: 'keep-all',
                                        display: 'inline-block'
                                    }}>
                                    #{tag}
                                </span>
                            );
                        })}
                    </div>
                ) : (
                    <div className="mypage-tag-grid" style={{display:'flex', gap:'10px', flexWrap:'wrap', marginTop:'15px'}}>
                        {currentTags.map(tag => (
                            <span key={tag} style={{background:'var(--bg-hover)', padding:'5px 12px', borderRadius:'15px', fontSize:'13px', color:'var(--text-primary)', wordBreak:'keep-all', display:'inline-block'}}>#{tag}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* 알림 설정 */}
            <div className="search-panel mypage-card" style={{marginTop:'20px', minWidth:0, overflow:'hidden'}}>
                <h3 style={{margin:'0 0 12px 0'}}>알림 설정</h3>
                <p style={{color:'#888', fontSize:'12px', marginBottom:'15px', marginTop:0}}>
                    중요한 게임 할인 소식과 맞춤 정보를 이메일 등으로 받으실 수 있습니다.
                </p>
                <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                    <label style={{display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', padding:'12px 15px', background:'var(--bg-card)', borderRadius:'8px', border:'1px solid var(--border)'}}>
                        <div>
                            <div style={{fontSize:'14px', color:'var(--text-primary)', fontWeight:'bold'}}>이메일 수신 동의</div>
                            <div style={{fontSize:'12px', color:'#888', marginTop:'4px'}}>AuraProject의 주요 알림을 이메일로 받습니다.</div>
                        </div>
                        <input type="checkbox" checked={notificationSettings.emailAlert} onChange={(e) => handleUpdateNoti('emailAlert', e.target.checked)} style={{transform:'scale(1.3)', cursor:'pointer', accentColor:'#E50914'}}/>
                    </label>
                    <label style={{display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', padding:'12px 15px', background:'var(--bg-card)', borderRadius:'8px', border:'1px solid var(--border)'}}>
                        <div>
                            <div style={{fontSize:'14px', color:'var(--text-primary)', fontWeight:'bold'}}>찜/목표가 게임 할인 알림</div>
                            <div style={{fontSize:'12px', color:'#888', marginTop:'4px'}}>내가 찜한 게임이나 목표가를 설정한 게임이 할인할 때 알려줍니다.</div>
                        </div>
                        <input type="checkbox" checked={notificationSettings.saleAlert} onChange={(e) => handleUpdateNoti('saleAlert', e.target.checked)} style={{transform:'scale(1.3)', cursor:'pointer', accentColor:'#E50914'}}/>
                    </label>
                    <label style={{display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', padding:'12px 15px', background:'var(--bg-card)', borderRadius:'8px', border:'1px solid var(--border)'}}>
                        <div>
                            <div style={{fontSize:'14px', color:'var(--text-primary)', fontWeight:'bold'}}>신작/트렌드 게임 알림</div>
                            <div style={{fontSize:'12px', color:'#888', marginTop:'4px'}}>요즘 뜨는 트렌드 게임이나 추천 신작을 알려줍니다.</div>
                        </div>
                        <input type="checkbox" checked={notificationSettings.newGameAlert} onChange={(e) => handleUpdateNoti('newGameAlert', e.target.checked)} style={{transform:'scale(1.3)', cursor:'pointer', accentColor:'#E50914'}}/>
                    </label>
                </div>
            </div>

            {/* 목표가 알림 내역 */}
            <div className="result-panel" style={{marginTop:'20px'}}>
                <h3 style={{margin:'0 0 15px 0'}}>내 목표가 알림 관리 ({priceAlerts.length})</h3>
                {priceAlerts.length === 0 ? (
                    <p style={{color:'#888', fontSize:'13px', margin:0}}>등록된 목표가 알림이 없습니다.</p>
                ) : (
                    <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                        {priceAlerts.map(alert => (
                            <div key={alert.slug} style={{display:'flex', alignItems:'center', gap:'15px', background:'var(--bg-card)', border:'1px solid var(--border)', padding:'10px', borderRadius:'8px'}}>
                                <img src={alert.game?.main_image || ''} alt="" style={{width:'80px', height:'45px', objectFit:'cover', borderRadius:'4px', background:'#222'}} />
                                <div style={{flex:1, minWidth:0}}>
                                    <div style={{fontSize:'14px', fontWeight:'bold', color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{alert.game?.title_ko || alert.game?.title || alert.slug}</div>
                                    <div style={{fontSize:'12px', color:'#888', marginTop:'4px'}}>
                                        현재가: <span style={{color: alert.game?.price_info?.current_price <= alert.targetPrice ? '#4CAF50' : '#888'}}>
                                            {alert.game?.price_info?.current_price?.toLocaleString() || 0}원
                                        </span> 
                                        <span style={{margin:'0 6px'}}>|</span> 
                                        목표가: <strong style={{color:'#E50914'}}>{alert.targetPrice.toLocaleString()}원</strong>
                                    </div>
                                </div>
                                <button onClick={() => handleDeletePriceAlert(alert.slug)} style={{background:'none', border:'1px solid #666', color:'#ccc', padding:'6px 12px', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>
                                    알림 삭제
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 관심없음 (숨김 처리) 관리 */}
            <div className="result-panel" style={{marginTop:'20px'}}>
                <h3 style={{margin:'0 0 15px 0'}}>관심 없는 게임 (숨김 처리됨) ({dislikedGames.length})</h3>
                <p style={{color:'#888', fontSize:'12px', marginBottom:'15px', marginTop:0}}>
                    추천에 표시되지 않도록 숨김 처리한 게임들입니다. 복구하면 다시 추천 리스트에 나타납니다.
                </p>
                {dislikedGames.length === 0 ? (
                    <p style={{color:'#888', fontSize:'13px', margin:0}}>관심 없는 게임으로 등록된 항목이 없습니다.</p>
                ) : (
                    <div style={{display:'flex', flexWrap:'wrap', gap:'10px'}}>
                        {dislikedGames.map(game => (
                            <div key={game.slug} style={{display:'flex', alignItems:'center', gap:'10px', background:'var(--bg-card)', border:'1px solid var(--border)', padding:'8px 12px', borderRadius:'8px', width:'fit-content'}}>
                                <img src={game.main_image} alt="" style={{width:'40px', height:'22px', objectFit:'cover', borderRadius:'2px', background:'#222'}} />
                                <span style={{fontSize:'13px', color:'var(--text-primary)', maxWidth:'150px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                    {game.title_ko || game.title}
                                </span>
                                <button onClick={() => handleCancelDislike(game.slug)} style={{background:'none', border:'none', color:'#4CAF50', cursor:'pointer', fontSize:'12px', fontWeight:'bold', padding:'4px', marginLeft:'5px'}}>
                                    복구
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="result-panel" style={{marginTop:'20px'}}>
                <h3>나의 찜 목록 ({wishlistGames.length})</h3>
                <div className="game-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'15px'}}>
                    {wishlistGames.map(game => (
                        <div key={game._id} className="game-card" onClick={() => navigate(`/game/${game.slug}`)}
                          style={{
                            display:'flex', flexDirection:'column',
                            backgroundColor:'var(--bg-card)', border:'1px solid var(--border)',
                            borderRadius:'8px', overflow:'hidden', cursor:'pointer', height:'100%', position: 'relative'
                          }}>
                            <img src={game.main_image} alt={game.title}
                              style={{width:'100%', aspectRatio:'16/9', objectFit:'cover', display:'block'}}
                              onError={(e)=>{e.target.src='data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22300%22 height%3D%22169%22%3E%3Crect width%3D%22300%22 height%3D%22169%22 fill%3D%22%23202020%22%2F%3E%3C%2Fsvg%3E';}} />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveFromWishlist(game.slug);
                                }}
                                title="찜 목록에서 삭제"
                                style={{
                                    position: 'absolute', top: '8px', right: '8px', zIndex: 20,
                                    background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                                    width: '28px', height: '28px', color: '#ccc', fontSize: '14px',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.15s, color 0.15s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background='rgba(229,9,20,0.9)'; e.currentTarget.style.color='#fff'; }}
                                onMouseLeave={e => { e.currentTarget.style.background='rgba(0,0,0,0.7)'; e.currentTarget.style.color='#ccc'; }}
                            >✕</button>
                            <div style={{padding:'10px', display:'flex', flexDirection:'column', flex:1}}>
                                <div style={{fontSize:'14px', fontWeight:'bold', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{game.title_ko || game.title}</div>
                                <PcCompatibilityBadge game={game} compact hideUnknown />

                                {/* 가격을 항상 하단 고정 (reason 유무로 카드 높이 안 흔들리게) */}
                                <div style={{fontSize:'13px', color:'#e50914', marginTop:'auto', paddingTop:'8px', fontWeight:'bold'}}>
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
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, API_BASE_URL } from '../config';

// ── 플레이어 타입 ─────────────────────────────────────────────────────────────
const PLAYER_TYPES = [
  { key: 'casual',       label: '가볍게 즐기는 편',          desc: '힐링, 캐주얼, 퍼즐 위주 추천' },
  { key: 'beginner',     label: '게임을 즐겨 하는 편',        desc: '인기 게임 + 취향 태그 기반 추천' },
  { key: 'intermediate', label: '다양한 장르를 즐기는 편',    desc: '트렌드 + 플레이 이력 균형 추천' },
  { key: 'hardcore',     label: '도전적인 게임을 즐기는 편',  desc: '플레이 이력 기반 심화 게임 추천' },
  { key: 'streamer',     label: '스트리머 / 크리에이터',      desc: '치지직·SOOP·Twitch 트렌드 위주 추천' },
];

// ── 선호 태그 ─────────────────────────────────────────────────────────────────
const TAG_GROUPS = {
  '장르':   ['RPG', 'FPS', '액션', '어드벤처', '전략', '시뮬레이션', '퍼즐', '공포', '생존', '로그라이크', '소울라이크', '배틀로얄', '격투', '카드게임'],
  '테마':   ['판타지', '다크판타지', 'SF', '사이버펑크', '중세', '역사', '좀비', '전쟁', '현대'],
  '특징':   ['오픈월드', '스토리', '협동', '멀티플레이', '싱글플레이', '고난이도', '캐릭터커스텀'],
  '그래픽': ['픽셀아트', '2D', '3D', '애니메이션풍', '귀여운', '힐링', '캐주얼'],
};

// ── 공통 스타일 ───────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: '#141414', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', color: '#fff' },
  logo: { color: '#E50914', fontSize: '11px', fontWeight: '900', letterSpacing: '2px', marginBottom: '10px' },
  title: { fontSize: '24px', fontWeight: '900', marginBottom: '6px', textAlign: 'center' },
  subtitle: { fontSize: '12.5px', color: '#aaa', textAlign: 'center', marginBottom: '6px', lineHeight: '1.6' },
  stepBar: { display: 'flex', gap: '6px', marginBottom: '24px', marginTop: '4px' },
  stepDot: (active, done) => ({
    width: active ? '28px' : '8px', height: '8px', borderRadius: '4px',
    background: done ? '#E50914' : active ? '#E50914' : '#333', transition: 'all 0.2s'
  }),
  card: (sel) => ({
    background: sel ? 'rgba(229,9,20,0.08)' : '#1a1a1a',
    border: `2px solid ${sel ? '#E50914' : '#2a2a2a'}`,
    borderRadius: '10px', padding: '13px 16px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s',
    width: '100%', maxWidth: '520px',
  }),
  radio: (sel) => ({
    width: '17px', height: '17px', borderRadius: '50%', flexShrink: 0,
    border: `2px solid ${sel ? '#E50914' : '#444'}`,
    background: sel ? '#E50914' : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }),
  radioDot: { width: '5px', height: '5px', borderRadius: '50%', background: '#fff' },
  btnPrimary: (disabled) => ({
    marginTop: '18px', width: '100%', maxWidth: '520px', padding: '13px',
    background: disabled ? '#2a2a2a' : '#E50914', color: disabled ? '#555' : '#fff',
    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700',
    cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
  }),
  btnSecondary: {
    marginTop: '10px', fontSize: '12px', color: '#555', cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none',
  },
};

// ── Step 1: 게이머 성향 ───────────────────────────────────────────────────────
function Step1({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '520px' }}>
      {PLAYER_TYPES.map(type => {
        const sel = value === type.key;
        return (
          <div key={type.key} style={S.card(sel)} onClick={() => onChange(type.key)}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: sel ? '700' : '400', color: sel ? '#fff' : '#ddd', marginBottom: '2px' }}>{type.label}</div>
              <div style={{ fontSize: '11px', color: sel ? '#E50914' : '#555', fontWeight: sel ? '600' : '400' }}>{type.desc}</div>
            </div>
            <div style={S.radio(sel)}>{sel && <div style={S.radioDot} />}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 2: 선호 태그 ─────────────────────────────────────────────────────────
function Step2({ value, onChange }) {
  const toggle = (tag) => {
    onChange(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 5 ? [...prev, tag] : prev
    );
  };
  return (
    <div style={{ width: '100%', maxWidth: '520px' }}>
      <div style={{ color: '#888', fontSize: '11.5px', textAlign: 'right', marginBottom: '10px' }}>
        {value.length}/5개 선택
      </div>
      {Object.entries(TAG_GROUPS).map(([group, tags]) => (
        <div key={group} style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: '#777', fontWeight: '600', marginBottom: '7px', borderLeft: '3px solid #E50914', paddingLeft: '8px' }}>{group}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {tags.map(tag => {
              const sel = value.includes(tag);
              const maxed = value.length >= 5 && !sel;
              return (
                <button key={tag} onClick={() => toggle(tag)} disabled={maxed}
                  style={{
                    padding: '5px 12px', borderRadius: '20px', fontSize: '12px', cursor: maxed ? 'not-allowed' : 'pointer',
                    background: sel ? '#E50914' : '#1e1e1e', color: sel ? '#fff' : maxed ? '#444' : '#ccc',
                    border: `1px solid ${sel ? '#E50914' : '#333'}`, transition: 'all 0.15s',
                  }}>{tag}</button>
              );
            })}
          </div>
        </div>
      ))}
      {value.length > 0 && (
        <div style={{ marginTop: '8px', color: '#666', fontSize: '11px' }}>
          선택: {value.join(', ')}
        </div>
      )}
    </div>
  );
}

// ── Step 3: Steam 연동 안내 ───────────────────────────────────────────────────
function Step3({ onSkip }) {
  const features = [
    { label: '내 라이브러리 분석', desc: '이미 보유한 게임을 제외하고 새 게임만 추천' },
    { label: '플레이타임 기반 추천', desc: '많이 플레이한 장르를 파악해 취향 맞춤 추천' },
    { label: '자동 성향 분류', desc: 'Steam 데이터로 게이머 유형을 자동 분석' },
  ];

  return (
    <div style={{ width: '100%', maxWidth: '520px' }}>
      {/* Steam 로고 영역 */}
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎮</div>
        <div style={{ fontSize: '16px', fontWeight: '900', color: '#fff', marginBottom: '4px' }}>Steam 계정 연동</div>
        <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.6' }}>
          Steam 라이브러리를 연동하면<br/>훨씬 정확한 맞춤 추천을 받을 수 있어요.
        </div>
      </div>

      {/* 기능 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '4px' }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #2a2a2a' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#E50914', color: '#fff', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>{i + 1}</div>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>{f.label}</div>
              <div style={{ fontSize: '11px', color: '#777' }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ color: '#555', fontSize: '10.5px', textAlign: 'center', marginTop: '10px' }}>
        Steam 연동은 마이페이지에서 언제든 할 수 있어요
      </div>
    </div>
  );
}

// ── 메인 OnboardingPage ───────────────────────────────────────────────────────
export default function OnboardingPage({ user, setUser }) {
  const [step, setStep] = useState(1);
  const [playerType, setPlayerType] = useState(user?.playerType || null);
  const [likedTags, setLikedTags] = useState(user?.likedTags || []);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const stepTitles = ['게이머 성향', '선호 태그', 'Steam 연동'];
  const stepSubs = [
    '성향에 맞게 게임을 추천해 드립니다.',
    '좋아하는 태그를 최대 5개 선택하세요.\n추천 정확도가 크게 올라갑니다.',
    '더 정확한 추천을 위해 Steam 계정을 연동해 보세요.',
  ];

  const saveStep1 = async () => {
    if (!playerType) return;
    setLoading(true);
    try {
      await apiClient.put('/user/playerType', { playerType });
    } catch (e) { console.error(e); }
    setLoading(false);
    setStep(2);
  };

  const saveStep2 = async () => {
    setLoading(true);
    try {
      if (likedTags.length > 0) {
        await apiClient.put('/user/liked-tags', { tags: likedTags });
      }
      if (setUser) {
        const res = await apiClient.get('/user/info');
        setUser(res.data);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
    setStep(3);
  };

  const handleSteamLink = () => {
    window.location.href = `${API_BASE_URL}/api/auth/steam`;
  };

  const handleFinish = () => navigate('/');

  return (
    <div style={S.page}>
      <div style={S.logo}>PLAY FOR YOU</div>
      <div style={S.title}>{stepTitles[step - 1]}</div>
      <div style={{ ...S.subtitle, whiteSpace: 'pre-line' }}>{stepSubs[step - 1]}</div>

      {/* 진행 바 */}
      <div style={S.stepBar}>
        {[1, 2, 3].map(n => (
          <div key={n} style={S.stepDot(step === n, step > n)} />
        ))}
      </div>

      {step === 1 && <Step1 value={playerType} onChange={setPlayerType} />}
      {step === 2 && <Step2 value={likedTags} onChange={setLikedTags} />}
      {step === 3 && <Step3 onSkip={handleFinish} />}

      {/* 버튼 */}
      {step === 1 && (
        <>
          <button style={S.btnPrimary(!playerType || loading)} onClick={saveStep1} disabled={!playerType || loading}>
            {loading ? '저장 중...' : '다음'}
          </button>
          <button style={S.btnSecondary} onClick={handleFinish}>나중에 설정할게요</button>
        </>
      )}
      {step === 2 && (
        <>
          <button style={S.btnPrimary(loading)} onClick={saveStep2} disabled={loading}>
            {loading ? '저장 중...' : likedTags.length > 0 ? '다음' : '건너뛰기'}
          </button>
          <button style={S.btnSecondary} onClick={() => setStep(1)}>이전</button>
        </>
      )}
      {step === 3 && (
        <>
          <button style={{ ...S.btnPrimary(false), marginTop: '18px', background: '#1b2838', border: '1px solid #4c6b22' }}
            onClick={handleSteamLink}>
            Steam으로 연동하기
          </button>
          <button style={{ ...S.btnPrimary(false), marginTop: '8px', background: '#2a2a2a' }}
            onClick={handleFinish}>
            나중에 연동할게요
          </button>
          <button style={S.btnSecondary} onClick={() => setStep(2)}>이전</button>
        </>
      )}
    </div>
  );
}
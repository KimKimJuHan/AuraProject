import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../config'; // 중괄호 import로 수정됨

function LoginPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
    
    const params = new URLSearchParams(location.search);
    if (params.get('error')) {
        alert('로그인에 실패했습니다. 다시 시도해주세요.');
    }
  }, [user, navigate, location]);

  const handleSteamLogin = () => {
    // API_BASE_URL과 경로를 정상적으로 결합하여 스팀 서버로 리다이렉트
    window.location.href = `${API_BASE_URL}/api/auth/steam`;
  };

  const pageStyle = {
    display: 'flex', justifyContent: 'center', alignItems: 'center', 
    minHeight: '100vh', backgroundColor: '#141414', padding: '20px'
  };

  const boxStyle = {
    backgroundColor: 'rgba(0, 0, 0, 0.75)', padding: '60px 68px 40px',
    borderRadius: '4px', width: '100%', maxWidth: '450px',
    display: 'flex', flexDirection: 'column', color: '#fff', alignItems: 'center'
  };

  const btnStyle = {
    borderRadius: '4px', fontSize: '16px', fontWeight: 'bold',
    margin: '24px 0 12px', padding: '16px',
    backgroundColor: '#171a21',
    color: '#fff', border: '1px solid #66c0f4',
    cursor: 'pointer', width: '100%',
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'
  };

  return (
    <div style={pageStyle}>
      <div style={boxStyle}>
        <h1 style={{ marginBottom: '28px', fontSize: '32px', fontWeight: 'bold', textAlign: 'center' }}>로그인</h1>
        <p style={{ marginBottom: '20px', color: '#aaaaaa', textAlign: 'center' }}>
          보다 정확한 맞춤형 게임 추천을 위해<br/>보유하신 Steam 계정으로 안전하게 로그인하세요.
        </p>
        
        <button onClick={handleSteamLogin} style={btnStyle}>
          <i className="fab fa-steam" style={{ fontSize: '20px' }}></i> Steam으로 로그인
        </button>

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '14px', textAlign: 'center' }}>
          * AuraProject는 사용자의 비밀번호를 수집하거나 저장하지 않습니다.
        </div>
      </div>
    </div>
  );
}
 
export default LoginPage;
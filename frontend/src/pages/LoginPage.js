import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient, API_BASE_URL } from '../config';

function LoginPage({ user, setUser }) {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await apiClient.post('/auth/login', {
        username: formData.username,
        password: formData.password,
        rememberMe: rememberMe
      });

      if (response.data.success) {
        setUser(response.data.user);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || '로그인 실패: 아이디 또는 비밀번호를 확인하세요.');
    }
  };

  // 소셜 로그인 핸들러 (.env 의존 제거 및 config 동적 URL 사용)
  const handleSocialLogin = (platform) => {
    window.location.href = `${API_BASE_URL}/api/auth/${platform}`;
  };

  const pageStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#141414', padding: '20px' };
  const boxStyle = { backgroundColor: 'rgba(0, 0, 0, 0.75)', padding: '60px 68px 40px', borderRadius: '4px', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', color: '#fff' };
  const inputStyle = { background: '#333', borderRadius: '4px', border: '0', color: '#fff', height: '50px', lineHeight: '50px', padding: '0 20px', width: '100%', marginBottom: '20px', boxSizing: 'border-box' };
  const btnStyle = { borderRadius: '4px', fontSize: '16px', fontWeight: 'bold', margin: '24px 0 12px', padding: '16px', background: '#e50914', color: '#fff', border: 'none', cursor: 'pointer', width: '100%' };
  
  // 소셜 버튼 스타일
  const socialBtnStyle = { width: '100%', padding: '12px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', border: 'none', marginBottom: '10px', fontSize: '14px' };

  return (
    <div style={pageStyle}>
      <div style={boxStyle}>
        <h1 style={{ marginBottom: '28px', fontSize: '32px', fontWeight: 'bold' }}>로그인</h1>
        {error && <div style={{ color: '#e87c03', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <input type="text" name="username" placeholder="아이디" value={formData.username} onChange={handleChange} style={inputStyle} required />
          <input type="password" name="password" placeholder="비밀번호" value={formData.password} onChange={handleChange} style={inputStyle} required />
          <button type="submit" style={btnStyle}>로그인</button>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#b3b3b3' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ marginRight: '5px' }} />
              로그인 유지
            </label>
          </div>
        </form>

        {/* ★ 소셜 로그인 버튼 영역 추가 */} 
        <div style={{ marginTop: '25px', borderTop: '1px solid #333', paddingTop: '25px' }}>
          <button onClick={() => handleSocialLogin('google')} style={{ ...socialBtnStyle, backgroundColor: '#fff', color: '#000' }}>Google 계정으로 로그인</button>
          <button onClick={() => handleSocialLogin('naver')} style={{ ...socialBtnStyle, backgroundColor: '#03C75A', color: '#fff' }}>네이버로 로그인</button>
        </div>

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '16px' }}>
          AuraProject 회원이 아닌가요? <Link to="/signup" style={{ color: '#fff', textDecoration: 'none', marginLeft: '5px' }}>지금 가입하세요.</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
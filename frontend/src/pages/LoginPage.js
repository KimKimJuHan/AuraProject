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

  const handleSocialLogin = (platform) => {
    window.location.href = `${API_BASE_URL}/api/auth/${platform}`;
  };

  const pageStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#141414',
    padding: '20px'
  };

  const boxStyle = {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    padding: '60px 68px 40px',
    borderRadius: '4px',
    width: '100%',
    maxWidth: '450px',
    display: 'flex',
    flexDirection: 'column',
    color: '#fff'
  };

  const inputStyle = {
    background: '#333',
    borderRadius: '4px',
    border: '0',
    color: '#fff',
    height: '50px',
    lineHeight: '50px',
    padding: '0 20px',
    width: '100%',
    marginBottom: '20px',
    boxSizing: 'border-box'
  };

  const btnStyle = {
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '24px 0 12px',
    padding: '16px',
    background: '#e50914',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    width: '100%'
  };

  const socialBtnStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer',
    border: 'none',
    marginBottom: '10px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  };

  const iconWrapStyle = {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  };

  return (
    <div style={pageStyle}>
      <div style={boxStyle}>
        <h1 style={{ marginBottom: '28px', fontSize: '32px', fontWeight: 'bold' }}>로그인</h1>
        {error && <div style={{ color: '#e87c03', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="username"
            placeholder="아이디"
            value={formData.username}
            onChange={handleChange}
            style={inputStyle}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="비밀번호"
            value={formData.password}
            onChange={handleChange}
            style={inputStyle}
            required
          />
          <button type="submit" style={btnStyle}>로그인</button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#b3b3b3' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ marginRight: '5px' }}
              />
              로그인 유지
            </label>
          </div>
        </form>

        <div style={{ marginTop: '25px', borderTop: '1px solid #333', paddingTop: '25px' }}>
          <button
            onClick={() => handleSocialLogin('google')}
            type="button"
            style={{ ...socialBtnStyle, backgroundColor: '#fff', color: '#000', border: '1px solid #ddd' }}
          >
            <span style={iconWrapStyle}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                width="18"
                height="18"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
            </span>
            <span>Google 계정으로 로그인</span>
          </button>

          <button
            onClick={() => handleSocialLogin('naver')}
            type="button"
            style={{ ...socialBtnStyle, backgroundColor: '#03C75A', color: '#fff' }}
          >
            <span style={iconWrapStyle}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="18"
                height="18"
              >
                <rect width="24" height="24" rx="4" fill="#03C75A" />
                <path
                  d="M6 5.5h4.1l3.9 5.62V5.5H18V18.5h-4.1L10 12.88v5.62H6V5.5z"
                  fill="#fff"
                />
              </svg>
            </span>
            <span>네이버로 로그인</span>
          </button>
        </div>

        <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
          <Link to="/find-id" style={{ color: '#b3b3b3', textDecoration: 'none' }}>
            아이디 찾기
          </Link>
          <Link to="/forgot-password" style={{ color: '#b3b3b3', textDecoration: 'none' }}>
            비밀번호 찾기
          </Link>
        </div>

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '16px' }}>
          AuraProject 회원이 아닌가요?
          <Link to="/signup" style={{ color: '#fff', textDecoration: 'none', marginLeft: '5px' }}>
            지금 가입하세요.
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
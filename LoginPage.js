// frontend/src/pages/LoginPage.js

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';

function LoginPage({ setUser }) {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [needsOtp, setNeedsOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username: formData.username,
        password: formData.password,
        rememberMe: rememberMe
      }, {
        withCredentials: true,
      });
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        navigate('/');
        return;
      }

      if (response.data.needsOtp) {
        setNeedsOtp(true);
        setError('인증 코드가 발송되었습니다. 이메일을 확인하고 아래에 코드를 입력하세요.');
        return;
      }
    } catch (err) {
      console.error(err);
      setError('로그인 실패: 아이디 또는 비밀번호를 확인하세요.');
    }
  };

  // 이메일 인증(OTP) 요청만 별도로 수행: username + password로 서버에 요청하면
  // 서버는 인증되지 않은 계정에 대해 needsOtp:true 응답을 보냅니다.
  const handleSendOtp = async (e) => {
    e && e.preventDefault();
    setError('');
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username: formData.username,
        password: formData.password,
        rememberMe: rememberMe
      }, { withCredentials: true });

      if (response.data.needsOtp) {
        setNeedsOtp(true);
        setError('인증 코드가 발송되었습니다. 이메일을 확인하세요.');
        return;
      }

      // 계정이 이미 인증된 경우: 자동 로그인하지 않고 안내만 보여줌
      if (response.data.user) {
        setError('해당 계정은 이미 이메일 인증이 되어 있습니다. 로그인 버튼으로 계속 진행하세요.');
        return;
      }
    } catch (err) {
      console.error(err);
      setError('이메일 인증 요청 실패: 아이디/비밀번호를 확인하세요.');
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login/verify`, {
        loginId: formData.username,
        code: otpCode,
        rememberMe: rememberMe
      }, { withCredentials: true });

      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        navigate('/');
      }
    } catch (err) {
      console.error(err);
      setError('인증 실패: 코드를 확인하세요.');
    }
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

  return (
    <div style={pageStyle}>
      <div style={boxStyle}>
        <h1 style={{ marginBottom: '28px', fontSize: '32px', fontWeight: 'bold' }}>로그인</h1>
        {error && <div style={{ color: '#e87c03', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
        
  {/* 로그인 버튼 제거: 폼 제출이 자동으로 발생하지 않도록 onSubmit을 막습니다 */}
  <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', minHeight: '420px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <input
              type="text"
              name="username"
              placeholder="이메일 또는 아이디"
              value={formData.username}
              onChange={handleChange}
              style={inputStyle}
            />
            <input
              type="password"
              name="password"
              placeholder="비밀번호"
              value={formData.password}
              onChange={handleChange}
              style={inputStyle}
              disabled={false}
            />

            {/* 이메일 인증 요청 버튼 (비밀번호 아래) */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={handleSendOtp} style={{ ...btnStyle, width: '50%' }}>이메일 인증</button>
              {/* 안내용 빈 공간(로그인 버튼은 아래에 배치) */}
              <div style={{ width: '50%' }} />
            </div>

            {/* 인증 코드 입력란: 항상 보이지만, 활성화는 needsOtp에 따라 처리 */}
            <div style={{ marginTop: '12px' }}>
              <label style={{ color: '#b3b3b3', fontSize: '13px', display: 'block', marginBottom: '6px' }}>인증 코드</label>
              <input
                type="text"
                name="otp"
                placeholder={needsOtp ? '이메일로 받은 6자리 코드 입력' : '먼저 이메일 인증을 눌러 코드를 발송하세요'}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                style={{ ...inputStyle, marginTop: '0px' }}
                disabled={!needsOtp}
              />
              <div style={{ marginTop: '8px' }}>
                <button onClick={handleVerify} style={btnStyle} disabled={!needsOtp}>코드 확인</button>
              </div>
            </div>

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
              <span style={{ cursor: 'pointer' }}>도움이 필요하신가요?</span>
            </div>
          </div>

          {/* 로그인 버튼 제거 완료: 사용자는 이메일 인증(OTP) + 코드 확인으로만 로그인합니다. */}
        </form>

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '16px' }}>
          AuraProject 회원이 아닌가요? <Link to="/signup" style={{ color: '#fff', textDecoration: 'none', marginLeft: '5px' }}>지금 가입하세요.</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
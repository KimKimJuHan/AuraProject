// frontend/src/pages/LoginPage.js

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
// ★ [수정] 안전한 저장소 import
import { safeLocalStorage } from '../utils/storage';

function LoginPage({ setUser }) {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
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
        // [수정] safeLocalStorage 사용
        safeLocalStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        navigate('/');
      }
    } catch (err) {
      console.error(err);
      setError('로그인 실패: 아이디 또는 비밀번호를 확인하세요.');
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
        
        <form onSubmit={handleSubmit}>
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
            <span style={{ cursor: 'pointer' }}>도움이 필요하신가요?</span>
          </div>
        </form>

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '16px' }}>
          AuraProject 회원이 아닌가요? <Link to="/signup" style={{ color: '#fff', textDecoration: 'none', marginLeft: '5px' }}>지금 가입하세요.</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
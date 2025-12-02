// frontend/src/pages/SignupPage.js

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';

function SignupPage() {
  const [step, setStep] = useState(1); // 1: 정보입력, 2: 인증코드확인
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    code: ''
  });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 1단계: 인증코드 발송 요청
  const handleSendCode = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return alert("비밀번호가 일치하지 않습니다.");
    }
    try {
      // ★ [수정] 백엔드 경로 /api/auth/signup 과 일치시킴
      await axios.post(`${API_BASE_URL}/api/auth/signup`, {
        email: formData.email,
        username: formData.username
      });
      alert("인증코드가 발송되었습니다. (서버 콘솔을 확인하세요)");
      setStep(2);
    } catch (err) {
      alert("발송 실패: " + (err.response?.data?.error || err.message));
    }
  };

  // 2단계: 가입 완료 요청
  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      // ★ [수정] 백엔드 경로 /api/auth/verify
      await axios.post(`${API_BASE_URL}/api/auth/verify`, {
        email: formData.email,
        username: formData.username,
        password: formData.password,
        code: formData.code
      });
      alert("가입이 완료되었습니다! 로그인해주세요.");
      navigate('/login');
    } catch (err) {
      alert("가입 실패: " + (err.response?.data?.error || err.message));
    }
  };

  // 스타일 객체 (로그인 페이지와 동일한 스타일 적용)
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
        <h1 style={{ marginBottom: '28px', fontSize: '32px', fontWeight: 'bold' }}>회원가입</h1>
        
        {step === 1 ? (
          <form onSubmit={handleSendCode}>
            <input
              type="text"
              name="username"
              placeholder="닉네임"
              value={formData.username}
              onChange={handleChange}
              style={inputStyle}
              required
            />
            <input
              type="email"
              name="email"
              placeholder="이메일"
              value={formData.email}
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
            <input
              type="password"
              name="confirmPassword"
              placeholder="비밀번호 확인"
              value={formData.confirmPassword}
              onChange={handleChange}
              style={inputStyle}
              required
            />
            <button type="submit" style={btnStyle}>인증코드 받기</button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <p style={{marginBottom:'20px', color:'#bbb'}}>
                입력하신 이메일로 인증코드가 전송되었습니다.<br/>
                (테스트 중이므로 백엔드 터미널 로그를 확인하세요)
            </p>
            <input
              type="text"
              name="code"
              placeholder="인증코드 6자리"
              value={formData.code}
              onChange={handleChange}
              style={inputStyle}
              required
            />
            <button type="submit" style={btnStyle}>가입 완료</button>
            <button 
                type="button" 
                onClick={() => setStep(1)} 
                style={{...btnStyle, background:'#333', marginTop:'10px'}}
            >
                뒤로 가기
            </button>
          </form>
        )}

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '16px' }}>
          이미 회원이신가요? <Link to="/login" style={{ color: '#fff', textDecoration: 'none', marginLeft: '5px' }}>로그인하기</Link>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;
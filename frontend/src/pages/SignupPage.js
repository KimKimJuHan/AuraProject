// frontend/src/pages/SignupPage.js

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../config';

function SignupPage() {
  const [step, setStep] = useState(1); // 1: 정보입력, 2: 인증코드확인
  const [formData, setFormData] = useState({
    email: '',
    username: '', // 이전 코드의 'username'을 의미. 아이디로 사용.
    password: '',
    confirmPassword: '',
    code: ''
  });
  const [loading, setLoading] = useState(false);
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
    
    setLoading(true);
    try {
      await apiClient.post('/auth/send-otp', {
        email: formData.email,
        username: formData.username
      });
      alert("인증코드가 발송되었습니다. (백엔드 터미널 또는 구글 메일함을 확인하세요)");
      setStep(2);
    } catch (err) {
      alert("발송 실패: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 2단계: 가입 완료 요청
  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post('/auth/verify-otp', {
        email: formData.email,
        username: formData.username,
        password: formData.password,
        code: formData.code
      });
      // 백엔드 라우터(signup) 호출 추가
      await apiClient.post('/auth/signup', formData);
      
      alert("가입이 완료되었습니다! 로그인해주세요.");
      navigate('/login');
    } catch (err) {
      alert("가입 실패: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // ★ 추가: 소셜 가입(로그인) 핸들러
  const handleSocialSignup = (platform) => {
      window.location.href = `http://43.200.122.206:8000/api/auth/${platform}`;
  };

  // 스타일 객체
  const pageStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#141414', padding: '20px' };
  const boxStyle = { backgroundColor: 'rgba(0, 0, 0, 0.75)', padding: '60px 68px 40px', borderRadius: '4px', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', color: '#fff' };
  const inputStyle = { background: '#333', borderRadius: '4px', border: '0', color: '#fff', height: '50px', lineHeight: '50px', padding: '0 20px', width: '100%', marginBottom: '20px', boxSizing: 'border-box' };
  const btnStyle = { borderRadius: '4px', fontSize: '16px', fontWeight: 'bold', margin: '24px 0 12px', padding: '16px', background: '#e50914', color: '#fff', border: 'none', cursor: 'pointer', width: '100%' };
  const socialBtnStyle = { width: '100%', padding: '12px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', border: 'none', marginBottom: '10px', fontSize: '14px' };

  return (
    <div style={pageStyle}>
      <div style={boxStyle}>
        <h1 style={{ marginBottom: '28px', fontSize: '32px', fontWeight: 'bold' }}>회원가입</h1>
        
        {step === 1 ? (
          <form onSubmit={handleSendCode}>
            <input type="text" name="username" placeholder="아이디 (로그인용)" value={formData.username} onChange={handleChange} style={inputStyle} required />
            <input type="email" name="email" placeholder="이메일 (OTP 전송용)" value={formData.email} onChange={handleChange} style={inputStyle} required />
            <input type="password" name="password" placeholder="비밀번호" value={formData.password} onChange={handleChange} style={inputStyle} required />
            <input type="password" name="confirmPassword" placeholder="비밀번호 확인" value={formData.confirmPassword} onChange={handleChange} style={inputStyle} required />
            <button type="submit" style={btnStyle} disabled={loading}>
              {loading ? '발송 중...' : '인증코드 받기'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <p style={{marginBottom:'20px', color:'#bbb', fontSize: '14px', lineHeight: '1.5'}}>
                입력하신 <strong>{formData.email}</strong>로<br/>
                6자리 인증코드가 전송되었습니다.
            </p>
            <input type="text" name="code" placeholder="인증코드 6자리" value={formData.code} onChange={handleChange} style={inputStyle} required />
            <button type="submit" style={btnStyle} disabled={loading}>
              {loading ? '검증 중...' : '가입 완료'}
            </button>
            <button type="button" onClick={() => setStep(1)} style={{...btnStyle, background:'#333', marginTop:'10px'}} disabled={loading}>
                정보 수정하기 (뒤로)
            </button>
          </form>
        )}

        {/* ★ 소셜 회원가입 영역 추가 */}
        <div style={{ marginTop: '25px', borderTop: '1px solid #333', paddingTop: '25px' }}>
            <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '14px', color: '#888' }}>또는 소셜 계정으로 빠른 가입</div>
            <button type="button" onClick={() => handleSocialSignup('google')} style={{ ...socialBtnStyle, backgroundColor: '#fff', color: '#000' }}>Google 계정으로 가입</button>
            <button type="button" onClick={() => handleSocialSignup('naver')} style={{ ...socialBtnStyle, backgroundColor: '#03C75A', color: '#fff' }}>네이버 아이디로 가입</button>
        </div>

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '16px' }}>
          이미 회원이신가요? <Link to="/login" style={{ color: '#fff', textDecoration: 'none', marginLeft: '5px' }}>로그인하기</Link>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;
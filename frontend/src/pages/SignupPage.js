import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

function SignupPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [otp, setOtp] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); };

  const requestOtp = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:8000/api/auth/signup', formData);
      alert("인증코드가 발송되었습니다. (백엔드 콘솔 확인)");
      setStep(2);
    } catch (err) { alert(err.response?.data?.error || "인증 요청 실패"); }
  };

  const verifyAndRegister = async (e) => {
    e.preventDefault();
    try {
      // ★★★ 수정된 부분: { withCredentials: true } 추가 ★★★
      await axios.post('http://localhost:8000/api/auth/verify', 
        { ...formData, code: otp },
        { withCredentials: true }
      );
      
      alert("가입 완료! 로그인해주세요.");
      navigate('/login');
    } catch (err) { alert(err.response?.data?.error || "가입 실패"); }
  };

  return (
    <div className="net-app auth-wrapper">
      <div className="auth-container">
        <h1 className="auth-title">회원가입</h1>
        {step === 1 ? (
          <form className="auth-form" onSubmit={requestOtp}>
            <input className="auth-input" name="username" placeholder="닉네임" value={formData.username} onChange={handleChange} required />
            <input className="auth-input" name="email" type="email" placeholder="이메일 주소" value={formData.email} onChange={handleChange} required />
            <input className="auth-input" name="password" type="password" placeholder="비밀번호 (6자 이상)" value={formData.password} onChange={handleChange} required />
            <button className="auth-btn" type="submit">인증코드 받기</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={verifyAndRegister}>
            <p style={{color:'#bbb', fontSize:'14px'}}>이메일로 전송된 인증코드를 입력하세요.</p>
            <input className="auth-input" placeholder="인증코드 6자리" value={otp} onChange={(e)=>setOtp(e.target.value)} required />
            <button className="auth-btn" type="submit">가입 완료</button>
            <button type="button" onClick={()=>setStep(1)} style={{background:'transparent', border:'none', color:'#bbb', cursor:'pointer', textDecoration:'underline', marginTop:'10px'}}>다시 입력하기</button>
          </form>
        )}
        <div className="auth-subtext">
          이미 계정이 있으신가요? <Link to="/login" className="auth-link">로그인하기</Link>
        </div>
      </div>
    </div>
  );
}
export default SignupPage;
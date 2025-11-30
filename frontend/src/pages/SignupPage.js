import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../config"; // ★ 설정 파일 import

function SignupPage() {
  const [step, setStep] = useState(1); // 1:입력, 2:인증
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) return alert("비밀번호가 일치하지 않습니다.");
    
    try {
      // ★ API 주소 변수 사용
      await axios.post(`${API_BASE_URL}/api/auth/send-otp`, { email });
      alert("인증번호가 발송되었습니다. 이메일을 확인해주세요.");
      setStep(2);
    } catch (err) {
      alert("인증번호 발송 실패: " + (err.response?.data?.message || err.message));
    }
  };

  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    try {
      // 1. 인증번호 검증
      await axios.post(`${API_BASE_URL}/api/auth/verify-otp`, { email, otp });
      
      // 2. 회원가입 진행
      await axios.post(`${API_BASE_URL}/api/auth/register`, { username, email, password });
      
      alert("회원가입 성공! 로그인해주세요.");
      navigate("/login");
    } catch (err) {
      alert("오류 발생: " + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>회원가입</h2>
        {step === 1 ? (
            <form onSubmit={handleSendOtp}>
                <input className="auth-input" type="text" placeholder="닉네임" value={username} onChange={(e)=>setUsername(e.target.value)} required />
                <input className="auth-input" type="email" placeholder="이메일" value={email} onChange={(e)=>setEmail(e.target.value)} required />
                <input className="auth-input" type="password" placeholder="비밀번호" value={password} onChange={(e)=>setPassword(e.target.value)} required />
                <input className="auth-input" type="password" placeholder="비밀번호 확인" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} required />
                <button className="auth-btn" type="submit">인증번호 받기</button>
            </form>
        ) : (
            <form onSubmit={handleVerifyAndRegister}>
                <div style={{marginBottom:'15px', color:'#ccc'}}>이메일: {email}</div>
                <input className="auth-input" type="text" placeholder="인증번호 6자리" value={otp} onChange={(e)=>setOtp(e.target.value)} required />
                <button className="auth-btn" type="submit">인증 확인 및 가입 완료</button>
                <button type="button" className="text-btn" onClick={()=>setStep(1)} style={{marginTop:'10px', color:'#888', background:'none', border:'none', cursor:'pointer'}}>뒤로가기</button>
            </form>
        )}
        <p className="auth-link">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </p>
      </div>
    </div>
  );
}

export default SignupPage;
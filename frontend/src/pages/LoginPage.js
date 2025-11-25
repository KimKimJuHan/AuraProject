import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

function LoginPage({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      // ★★★ 수정된 부분: { withCredentials: true } 추가 ★★★
      // 이 옵션이 있어야 백엔드가 주는 '쿠키(token)'를 브라우저가 저장합니다.
      const res = await axios.post('http://localhost:8000/api/auth/login', 
        { email, password },
        { withCredentials: true } 
      );

      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      alert("환영합니다!");
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.error || "로그인 실패");
    }
  };

  return (
    <div className="net-app auth-wrapper">
      <div className="auth-container">
        <h1 className="auth-title">로그인</h1>
        <form className="auth-form" onSubmit={handleLogin}>
          <input className="auth-input" type="email" placeholder="이메일" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder="비밀번호" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <button className="auth-btn" type="submit">로그인</button>
        </form>
        <div className="auth-subtext">
          Play For You 회원이 아니신가요? <Link to="/signup" className="auth-link">지금 가입하세요.</Link>
        </div>
      </div>
    </div>
  );
}
export default LoginPage;
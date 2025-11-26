import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

function LoginPage({ setUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [autoLogin, setAutoLogin] = useState(false); // ★ 자동 로그인 체크 상태
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:8000/api/auth/login', 
        { email, password },
        { withCredentials: true } 
      );

      // ★ [오류 수정] 오타 제거 및 변수 할당 수정
      const storage = autoLogin ? localStorage : sessionStorage;
      
      // ★ [오류 수정] 쉼표 연산자 대신 명확한 블록 구문 사용
      if (autoLogin) {
          sessionStorage.clear();
      } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
      }

      storage.setItem('token', res.data.token);
      storage.setItem('user', JSON.stringify(res.data.user));
      
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
          
          {/* ★ 자동 로그인 체크박스 UI */}
          <div style={{display:'flex', alignItems:'center', gap:'10px', color:'#b3b3b3', fontSize:'14px'}}>
            <input 
                type="checkbox" 
                id="autoLogin" 
                checked={autoLogin} 
                onChange={(e) => setAutoLogin(e.target.checked)}
                style={{cursor:'pointer', width:'16px', height:'16px', accentColor:'#E50914'}}
            />
            <label htmlFor="autoLogin" style={{cursor:'pointer'}}>자동 로그인</label>
          </div>

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
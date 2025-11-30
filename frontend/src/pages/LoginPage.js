import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../config"; // ★ 설정 파일 import

function LoginPage({ setUser }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      // ★ API 주소 변수 사용
      const res = await axios.post(`${API_BASE_URL}/api/auth/login`, { email, password });
      
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      setUser(res.data.user);
      
      alert("로그인 성공!");
      navigate("/");
    } catch (err) {
      alert("로그인 실패: " + (err.response?.data?.message || err.message));
    }
  };

  const handleSteamLogin = () => {
    // ★ API 주소 변수 사용
    window.location.href = `${API_BASE_URL}/api/auth/steam`;
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>로그인</h2>
        <form onSubmit={handleLogin}>
          <input className="auth-input" type="email" placeholder="이메일" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder="비밀번호" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <button className="auth-btn" type="submit">로그인</button>
        </form>
        
        <div className="divider"><span>또는</span></div>
        
        <button className="steam-btn" onClick={handleSteamLogin}>
          <span style={{marginRight:'8px'}}>🎮</span> Steam으로 로그인
        </button>

        <p className="auth-link">
          계정이 없으신가요? <Link to="/signup">회원가입</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
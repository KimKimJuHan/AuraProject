import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../config';

const containerStyle = {
  minHeight: 'calc(100vh - 80px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: '#121212',
  padding: '40px 16px',
};

const cardStyle = {
  width: '420px',
  backgroundColor: '#0b0b0b',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '28px',
  color: '#fff',
};

const inputStyle = {
  width: '100%',
  padding: '12px',
  marginTop: '10px',
  backgroundColor: '#2b2b2b',
  border: '1px solid #444',
  borderRadius: '6px',
  color: '#fff',
  boxSizing: 'border-box',
};

const btnStyle = {
  width: '100%',
  padding: '12px',
  marginTop: '14px',
  backgroundColor: '#E50914',
  border: 'none',
  borderRadius: '6px',
  color: '#fff',
  fontWeight: 'bold',
  cursor: 'pointer',
};

export default function FindIdPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('request'); // request | verify
  const [maskedUsernames, setMaskedUsernames] = useState([]);
  const [message, setMessage] = useState('');

  const sendOtp = async () => {
    setMessage('');
    try {
      await apiClient.post('/auth/find-username/send-otp', { email });
      setStep('verify');
      setMessage('인증 코드가 발송되었습니다. 메일함을 확인해 주세요.');
    } catch (e) {
      console.error(e);
      setMessage('인증 코드 발송 중 오류가 발생했습니다.');
    }
  };

  const verifyOtp = async () => {
    setMessage('');
    try {
      const res = await apiClient.post('/auth/find-username/verify-otp', { email, code });
      if (res.data?.success) {
        setMaskedUsernames(res.data.maskedUsernames || []);
        setMessage('인증이 완료되었습니다.');
      } else {
        setMessage(res.data?.message || '인증에 실패했습니다.');
      }
    } catch (e) {
      console.error(e);
      setMessage(e?.response?.data?.message || '인증에 실패했습니다.');
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: 0, marginBottom: 16 }}>아이디 찾기</h2>

        <label>이메일</label>
        <input
          style={inputStyle}
          type="email"
          placeholder="가입한 이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {step === 'request' && (
          <button style={btnStyle} onClick={sendOtp} disabled={!email}>
            인증코드 받기
          </button>
        )}

        {step === 'verify' && (
          <>
            <label style={{ marginTop: 14, display: 'block' }}>인증코드</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="6자리 코드"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button style={btnStyle} onClick={verifyOtp} disabled={!email || !code}>
              인증하고 아이디 확인
            </button>
          </>
        )}

        {message && <p style={{ marginTop: 12, color: '#bbb' }}>{message}</p>}

        {maskedUsernames.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#bbb', marginBottom: 8 }}>가입된 아이디</div>
            <ul>
              {maskedUsernames.map((u, idx) => (
                <li key={`${u}-${idx}`}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 13, color: '#aaa' }}>
          <Link to="/login" style={{ color: '#fff', textDecoration: 'underline' }}>로그인으로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
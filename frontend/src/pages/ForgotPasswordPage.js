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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState(''); // 선택
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [step, setStep] = useState('request'); // request | verify | reset
  const [message, setMessage] = useState('');

  const sendOtp = async () => {
    setMessage('');
    try {
      await apiClient.post('/auth/reset-password/send-otp', { email, username: username || undefined });
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
      const res = await apiClient.post('/auth/reset-password/verify-otp', {
        email,
        code,
        username: username || undefined,
      });

      if (res.data?.success) {
        setResetToken(res.data.resetToken); // 존재하지 않는 계정이면 null일 수 있음
        setStep('reset');
        setMessage('인증이 완료되었습니다. 새 비밀번호를 설정해 주세요.');
      } else {
        setMessage(res.data?.message || '인증에 실패했습니다.');
      }
    } catch (e) {
      console.error(e);
      setMessage(e?.response?.data?.message || '인증에 실패했습니다.');
    }
  };

  const resetPassword = async () => {
    if (newPassword !== newPassword2) {
      setMessage('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setMessage('');

    try {
      // resetToken이 null이면(존재 안하는 계정), 보안상 성공처럼 처리하는 게 안전함
      if (!resetToken) {
        setMessage('비밀번호 재설정이 완료되었습니다. 로그인해 주세요.');
        return;
      }

      const res = await apiClient.post('/auth/reset-password/confirm', {
        resetToken,
        newPassword,
      });

      if (res.data?.success) {
        setMessage('비밀번호가 변경되었습니다. 로그인해 주세요.');
      } else {
        setMessage(res.data?.message || '비밀번호 변경에 실패했습니다.');
      }
    } catch (e) {
      console.error(e);
      setMessage(e?.response?.data?.message || '비밀번호 변경에 실패했습니다.');
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: 0, marginBottom: 16 }}>비밀번호 찾기</h2>

        <label>이메일</label>
        <input
          style={inputStyle}
          type="email"
          placeholder="가입한 이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label style={{ marginTop: 14, display: 'block' }}>아이디(선택)</label>
        <input
          style={inputStyle}
          type="text"
          placeholder="아이디를 알고 있다면 입력"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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
              인증하기
            </button>
          </>
        )}

        {step === 'reset' && (
          <>
            <label style={{ marginTop: 14, display: 'block' }}>새 비밀번호</label>
            <input
              style={inputStyle}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <label style={{ marginTop: 14, display: 'block' }}>새 비밀번호 확인</label>
            <input
              style={inputStyle}
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
            />
            <button style={btnStyle} onClick={resetPassword} disabled={!newPassword || !newPassword2}>
              비밀번호 변경
            </button>
          </>
        )}

        {message && <p style={{ marginTop: 12, color: '#bbb' }}>{message}</p>}

        <div style={{ marginTop: 18, fontSize: 13, color: '#aaa' }}>
          <Link to="/login" style={{ color: '#fff', textDecoration: 'underline' }}>로그인으로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
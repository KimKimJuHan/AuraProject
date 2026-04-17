import React, { useState, useEffect } from 'react';
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

const btnDisabledStyle = {
  ...btnStyle,
  backgroundColor: '#555',
  cursor: 'not-allowed',
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  
  const [step, setStep] = useState('request'); 
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    let timer;
    if (timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && step === 'verify') {
      setMessage('인증 시간이 만료되었습니다. 다시 시도해주세요.');
      setStep('request');
    }
    return () => clearInterval(timer);
  }, [timeLeft, step]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const sendOtp = async () => {
    setMessage('');
    setIsSending(true);
    try {
      await apiClient.post('/auth/reset-password/send-otp', { email });
      setStep('verify');
      setTimeLeft(600); // 10분 타이머 시작
      setMessage('인증 코드가 발송되었습니다. 메일함을 확인해 주세요.');
    } catch (e) {
      console.error(e);
      setMessage('인증 코드 발송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  const verifyOtp = async () => {
    setMessage('');
    try {
      const res = await apiClient.post('/auth/reset-password/verify-otp', { email, code });

      if (res.data?.success) {
        setResetToken(res.data.resetToken); 
        setTimeLeft(-1); // 타이머 정지
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

        <label>가입한 이메일</label>
        <input
          style={inputStyle}
          type="email"
          placeholder="이메일을 입력하세요"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={step !== 'request'}
        />

        {step === 'request' && (
          <button 
            style={(!email || isSending) ? btnDisabledStyle : btnStyle} 
            onClick={sendOtp} 
            disabled={!email || isSending}
          >
            {isSending ? '발송 중...' : '인증코드 받기'}
          </button>
        )}

        {step === 'verify' && timeLeft > 0 && (
          <>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>인증코드</label>
              <span style={{ color: '#E50914', fontWeight: 'bold' }}>{formatTime(timeLeft)}</span>
            </div>
            <input
              style={inputStyle}
              type="text"
              placeholder="6자리 코드"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button 
              style={(!email || !code) ? btnDisabledStyle : btnStyle} 
              onClick={verifyOtp} 
              disabled={!email || !code}
            >
              인증하기
            </button>
            <button 
              style={{...btnStyle, backgroundColor: 'transparent', border: '1px solid #555', marginTop: '10px'}} 
              onClick={() => { setStep('request'); setTimeLeft(0); setCode(''); }}
            >
              인증번호 재발송
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
            <button 
              style={(!newPassword || !newPassword2) ? btnDisabledStyle : btnStyle} 
              onClick={resetPassword} 
              disabled={!newPassword || !newPassword2}
            >
              비밀번호 변경
            </button>
          </>
        )}

        {message && <p style={{ marginTop: 12, color: message.includes('실패') || message.includes('불일치') || message.includes('만료') ? '#E50914' : '#bbb' }}>{message}</p>}

        <div style={{ marginTop: 18, fontSize: 13, color: '#aaa' }}>
          <Link to="/login" style={{ color: '#fff', textDecoration: 'underline' }}>로그인으로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
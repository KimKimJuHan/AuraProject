import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../config';

function ResetPasswordPage() {
  const [step, setStep] = useState(1); // 1: 이메일, 2: OTP, 3: 새 비밀번호
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const pageStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#141414', padding: '20px' };
  const boxStyle = { backgroundColor: 'rgba(0, 0, 0, 0.75)', padding: '60px 68px 40px', borderRadius: '4px', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', color: '#fff' };
  const inputStyle = { background: '#333', borderRadius: '4px', border: '0', color: '#fff', height: '50px', lineHeight: '50px', padding: '0 20px', width: '100%', marginBottom: '20px', boxSizing: 'border-box' };
  const btnStyle = { borderRadius: '4px', fontSize: '16px', fontWeight: 'bold', margin: '24px 0 12px', padding: '16px', background: '#e50914', color: '#fff', border: 'none', cursor: 'pointer', width: '100%' };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.post('/auth/request-password-reset', { email });
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/verify-reset-otp', { email, code });
      setResetToken(res.data.resetToken);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || '인증코드가 틀리거나 만료되었습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      return setError('비밀번호가 일치하지 않습니다.');
    }
    if (newPassword.length < 6) {
      return setError('비밀번호는 최소 6자 이상이어야 합니다.');
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { resetToken, newPassword });
      alert('비밀번호가 성공적으로 변경되었습니다. 새 비밀번호로 로그인해주세요.');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || '오류가 발생했습니다. 처음부터 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={boxStyle}>
        <h1 style={{ marginBottom: '28px', fontSize: '28px', fontWeight: 'bold' }}>비밀번호 찾기</h1>

        {error && <div style={{ color: '#e87c03', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}

        {step === 1 && (
          <form onSubmit={handleRequestOtp}>
            <p style={{ color: '#b3b3b3', marginBottom: '20px', fontSize: '14px' }}>
              가입 시 등록한 이메일 주소를 입력하면 인증코드를 발송해 드립니다.
            </p>
            <input
              type="email"
              placeholder="이메일 주소"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
            />
            <button type="submit" style={btnStyle} disabled={loading}>
              {loading ? '발송 중...' : '인증코드 받기'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOtp}>
            <p style={{ color: '#b3b3b3', marginBottom: '20px', fontSize: '14px' }}>
              <strong>{email}</strong>로 발송된 6자리 인증코드를 입력해주세요.
            </p>
            <input
              type="text"
              placeholder="인증코드 6자리"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={inputStyle}
              maxLength={6}
              required
            />
            <button type="submit" style={btnStyle} disabled={loading}>
              {loading ? '확인 중...' : '인증 확인'}
            </button>
            <button
              type="button"
              onClick={() => { setStep(1); setCode(''); setError(''); }}
              style={{ ...btnStyle, background: '#333', marginTop: '0' }}
            >
              이메일 다시 입력
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword}>
            <p style={{ color: '#b3b3b3', marginBottom: '20px', fontSize: '14px' }}>
              새로운 비밀번호를 입력해주세요. (최소 6자 이상)
            </p>
            <input
              type="password"
              placeholder="새 비밀번호"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
              required
            />
            <input
              type="password"
              placeholder="새 비밀번호 확인"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
              required
            />
            <button type="submit" style={btnStyle} disabled={loading}>
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        )}

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '14px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <Link to="/login" style={{ color: '#fff', textDecoration: 'none' }}>로그인</Link>
          <span>|</span>
          <Link to="/find-id" style={{ color: '#fff', textDecoration: 'none' }}>아이디 찾기</Link>
          <span>|</span>
          <Link to="/signup" style={{ color: '#fff', textDecoration: 'none' }}>회원가입</Link>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;

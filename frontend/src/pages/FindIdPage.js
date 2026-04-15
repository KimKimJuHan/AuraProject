import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../config';

function FindIdPage() {
  const [step, setStep] = useState(1); // 1: 이메일 입력, 2: OTP 입력, 3: 결과
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [usernames, setUsernames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pageStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#141414', padding: '20px' };
  const boxStyle = { backgroundColor: 'rgba(0, 0, 0, 0.75)', padding: '60px 68px 40px', borderRadius: '4px', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', color: '#fff' };
  const inputStyle = { background: '#333', borderRadius: '4px', border: '0', color: '#fff', height: '50px', lineHeight: '50px', padding: '0 20px', width: '100%', marginBottom: '20px', boxSizing: 'border-box' };
  const btnStyle = { borderRadius: '4px', fontSize: '16px', fontWeight: 'bold', margin: '24px 0 12px', padding: '16px', background: '#e50914', color: '#fff', border: 'none', cursor: 'pointer', width: '100%' };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.post('/auth/request-find-id', { email });
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
      const res = await apiClient.post('/auth/find-id', { email, code });
      setUsernames(res.data.usernames || []);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || '인증코드가 틀리거나 만료되었습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={boxStyle}>
        <h1 style={{ marginBottom: '28px', fontSize: '28px', fontWeight: 'bold' }}>아이디 찾기</h1>

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
              {loading ? '확인 중...' : '아이디 확인'}
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
          <div>
            {usernames.length > 0 ? (
              <>
                <p style={{ color: '#b3b3b3', marginBottom: '15px', fontSize: '14px' }}>
                  해당 이메일로 가입된 아이디입니다.
                </p>
                {usernames.map((name, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#222',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '14px 20px',
                      marginBottom: '10px',
                      fontSize: '18px',
                      letterSpacing: '2px',
                      color: '#fff',
                    }}
                  >
                    {name}
                  </div>
                ))}
              </>
            ) : (
              <p style={{ color: '#b3b3b3', fontSize: '14px' }}>
                해당 이메일로 가입된 아이디를 찾을 수 없습니다.
              </p>
            )}
          </div>
        )}

        <div style={{ marginTop: '30px', color: '#737373', fontSize: '14px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <Link to="/login" style={{ color: '#fff', textDecoration: 'none' }}>로그인</Link>
          <span>|</span>
          <Link to="/reset-password" style={{ color: '#fff', textDecoration: 'none' }}>비밀번호 찾기</Link>
          <span>|</span>
          <Link to="/signup" style={{ color: '#fff', textDecoration: 'none' }}>회원가입</Link>
        </div>
      </div>
    </div>
  );
}

export default FindIdPage;

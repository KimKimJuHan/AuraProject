import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../config';

function ChangePasswordPage({ user }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  const pageStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#141414', padding: '20px' };
  const boxStyle = { backgroundColor: 'rgba(0, 0, 0, 0.75)', padding: '60px 68px 40px', borderRadius: '4px', width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', color: '#fff' };
  const inputStyle = { background: '#333', borderRadius: '4px', border: '0', color: '#fff', height: '50px', lineHeight: '50px', padding: '0 20px', width: '100%', marginBottom: '20px', boxSizing: 'border-box' };
  const btnStyle = { borderRadius: '4px', fontSize: '16px', fontWeight: 'bold', margin: '24px 0 12px', padding: '16px', background: '#e50914', color: '#fff', border: 'none', cursor: 'pointer', width: '100%' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      return setError('새 비밀번호가 일치하지 않습니다.');
    }
    if (newPassword.length < 6) {
      return setError('비밀번호는 최소 6자 이상이어야 합니다.');
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword, confirmPassword });
      setSuccess('비밀번호가 성공적으로 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={boxStyle}>
        <h1 style={{ marginBottom: '28px', fontSize: '28px', fontWeight: 'bold' }}>비밀번호 변경</h1>

        {error && <div style={{ color: '#e87c03', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
        {success && <div style={{ color: '#4CAF50', marginBottom: '10px', fontSize: '14px' }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="현재 비밀번호"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder="새 비밀번호 (최소 6자)"
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

        <div style={{ marginTop: '20px', fontSize: '14px' }}>
          <Link to="/mypage" style={{ color: '#b3b3b3', textDecoration: 'none' }}>← 마이페이지로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}

export default ChangePasswordPage;

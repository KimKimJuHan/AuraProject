import React, { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
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

export default function ChangePasswordPage({ user }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [message, setMessage] = useState('');

  if (!user) return <Navigate to="/login" replace />;

  const submit = async () => {
    if (newPassword !== newPassword2) {
      setMessage('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setMessage('');

    try {
      const res = await apiClient.post('/auth/change-password', { currentPassword, newPassword });
      if (res.data?.success) {
        setMessage('비밀번호가 변경되었습니다.');
        setCurrentPassword('');
        setNewPassword('');
        setNewPassword2('');
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
        <h2 style={{ margin: 0, marginBottom: 16 }}>비밀번호 변경</h2>

        <label>현재 비밀번호</label>
        <input
          style={inputStyle}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />

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
          style={btnStyle}
          onClick={submit}
          disabled={!currentPassword || !newPassword || !newPassword2}
        >
          변경하기
        </button>

        {message && <p style={{ marginTop: 12, color: '#bbb' }}>{message}</p>}

        <div style={{ marginTop: 18, fontSize: 13, color: '#aaa' }}>
          <Link to="/mypage" style={{ color: '#fff', textDecoration: 'underline' }}>마이페이지로</Link>
        </div>
      </div>
    </div>
  );
}
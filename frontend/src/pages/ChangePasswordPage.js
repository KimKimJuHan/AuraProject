import React, { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { apiClient } from '../config';

const containerStyle = { minHeight: '100vh', backgroundColor: '#141414', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' };
const cardStyle = { backgroundColor: '#181818', border: '1px solid #333', borderRadius: '8px', padding: '30px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column' };
const inputStyle = { padding: '12px', marginTop: '8px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#222', color: '#fff', fontSize: '14px', outline: 'none' };
const btnStyle = { marginTop: '20px', padding: '12px', backgroundColor: '#E50914', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' };

export default function ChangePasswordPage({ user }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [message, setMessage] = useState('');

  if (!user) return <Navigate to="/login" replace />;

  // 소셜 로그인 유저 판별 (naver_, google_, steam_ 접두사 기준)
  const isSocialUser = user.username.startsWith('naver_') || user.username.startsWith('google_') || user.username.startsWith('steam_');

  if (isSocialUser) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <h2 style={{ margin: 0, marginBottom: 16 }}>비밀번호 변경 불가</h2>
            <div style={{ backgroundColor: '#222', padding: '20px', borderRadius: '8px', textAlign: 'center', margin: '20px 0' }}>
                <p style={{ color: '#bbb', lineHeight: '1.5' }}>
                    회원님은 <b>소셜 로그인(네이버/구글/스팀)</b>으로 가입된 계정입니다.<br/><br/>
                    해당 계정은 비밀번호가 존재하지 않으므로 변경할 수 없습니다. 
                    일반 이메일 로그인을 병행하시려면 '비밀번호 찾기'를 통해 초기 비밀번호를 설정해 주십시오.
                </p>
            </div>
            <Link to="/forgot-password" style={{ textDecoration: 'none', textAlign: 'center' }}>
                <button style={{...btnStyle, width: '100%'}}>비밀번호 찾기로 이동</button>
            </Link>
            <div style={{ marginTop: 18, fontSize: 13, color: '#aaa', textAlign: 'center' }}>
              <Link to="/mypage" style={{ color: '#fff', textDecoration: 'underline' }}>마이페이지로 돌아가기</Link>
            </div>
          </div>
        </div>
      );
  }

  const submit = async () => {
    if (newPassword !== newPassword2) {
      setMessage('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setMessage('');
    try {
      const res = await apiClient.post('/auth/change-password', { currentPassword, newPassword });
      if (res.data?.success) {
        setMessage('비밀번호가 성공적으로 변경되었습니다.');
        setCurrentPassword(''); setNewPassword(''); setNewPassword2('');
      } else {
        setMessage(res.data?.message || '비밀번호 변경 실패');
      }
    } catch (e) {
      setMessage(e?.response?.data?.message || '서버 오류가 발생했습니다.');
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ margin: 0, marginBottom: 16 }}>비밀번호 변경</h2>
        <label>현재 비밀번호</label>
        <input style={inputStyle} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <label style={{ marginTop: 14 }}>새 비밀번호</label>
        <input style={inputStyle} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <label style={{ marginTop: 14 }}>새 비밀번호 확인</label>
        <input style={inputStyle} type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} />
        <button style={btnStyle} onClick={submit} disabled={!currentPassword || !newPassword || !newPassword2}>변경하기</button>
        {message && <p style={{ marginTop: 12, color: message.includes('성공') ? '#46d369' : '#E50914' }}>{message}</p>}
        <div style={{ marginTop: 18, fontSize: 13, color: '#aaa', textAlign: 'center' }}>
          <Link to="/mypage" style={{ color: '#fff', textDecoration: 'underline' }}>마이페이지로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
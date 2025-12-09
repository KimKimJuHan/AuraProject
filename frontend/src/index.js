// frontend/src/MainPage.js
import React from 'react';
import { Link } from 'react-router-dom';

function MainPage({ region, user }) {
  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h1>메인 페이지</h1>
      <p>환영합니다! {user ? `${user.username}님` : '로그인해주세요.'}</p>
      
      {/* 여기에 원래 있던 배너나 게임 리스트 컴포넌트를 넣으셔야 합니다 */}
      <div style={{ marginTop: '20px' }}>
        <p>추천 게임을 확인해보세요.</p>
        <Link to="/search" style={{ color: '#E50914' }}>게임 검색하러 가기 &gt;</Link>
      </div>
    </div>
  );
}

export default MainPage;
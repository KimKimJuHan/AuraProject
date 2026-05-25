import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL, apiClient } from './config';
import { safeLocalStorage } from './utils/storage';
import AdminInquiryPage from './pages/Support/AdminInquiryPage';
import FindIdPage from './pages/FindIdPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ShopPage from './ShopPage';
import ComparisonPage from './ComparisonPage';
import SearchResultsPage from './SearchResultsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage'; 
import PersonalRecoPage from './pages/PersonalRecoPage';
import MyPage from './pages/MyPage';
import InquiryNewPage from './pages/Support/InquiryNewPage';
import InquiryListPage from './pages/Support/InquiryListPage';
import FaqPage from './pages/Support/FaqPage';
import ProfileDropdown from './components/ProfileDropdown';
import Skeleton from './Skeleton';
import { formatPrice } from './utils/priceFormatter';
import { checkPcCompatibility } from './utils/pcCompatibility';
import OnboardingPopup from './components/OnboardingPopup';
import NotificationPage from './pages/NotificationPage';
import OnboardingPage from './pages/OnboardingPage';
import { useTheme } from './context/ThemeContext';

function NotFoundPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', color: '#fff', textAlign: 'center'
    }}>
      <div style={{ fontSize: '80px', fontWeight: 'bold', color: '#E50914', lineHeight: 1 }}>404</div>
      <div style={{ fontSize: '22px', margin: '16px 0 8px', fontWeight: 'bold' }}>페이지를 찾을 수 없습니다</div>
      <div style={{ color: '#888', fontSize: '14px', marginBottom: '28px' }}>
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </div>
      <a href="/" style={{
        background: '#E50914', color: '#fff', padding: '12px 28px',
        borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px'
      }}>메인으로 돌아가기</a>
    </div>
  );
}

const TAG_CATEGORIES = {
  '장르':   ['RPG', 'FPS', '액션', '어드벤처', '전략', '턴제', '시뮬레이션', '퍼즐', '플랫포머', '공포', '생존', '로그라이크', '소울라이크', '메트로배니아', '리듬', '격투', '카드게임', 'MOBA', '배틀로얄', '비주얼노벨'],
  '시점':   ['1인칭', '3인칭', '쿼터뷰', '탑다운', '횡스크롤'],
  '그래픽': ['픽셀아트', '2D', '3D', '애니메이션풍', '현실적', '귀여운', '힐링', '캐주얼'],
  '테마':   ['판타지', '다크판타지', 'SF', '우주', '사이버펑크', '스팀펑크', '중세', '역사', '좀비', '포스트아포칼립스', '전쟁', '밀리터리', '현대', '느와르'],
  '특징':   ['오픈월드', '샌드박스', '스토리', '선택지', '멀티엔딩', '고난이도', '협동', '로컬협동', 'PvP', '경쟁', '멀티플레이', '싱글플레이', '캐릭터커스텀', '자원관리', '기지건설'],
};

// 카테고리별 기본 노출 태그 수 (나머지는 '더보기'로 숨김)
const TAG_DEFAULT_SHOW = {
  '장르':   10,  // RPG~소울라이크까지
  '시점':   5,   // 전부 노출
  '그래픽': 6,   // 픽셀아트~귀여운
  '테마':   7,   // 판타지~좀비
  '특징':   8,   // 오픈월드~협동
};

const styles = {
  tabContainer: { display: 'flex', gap:'20px', marginBottom:'20px', borderBottom:'1px solid #333', paddingBottom:'1px', overflowX:'auto', flexWrap:'nowrap' },
  tabButton: { background: 'none', color: '#b3b3b3', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid transparent', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px', transition: 'color 0.2s' },
  tabButtonActive: { background: 'none', color: '#fff', borderTop:'none', borderLeft:'none', borderRight:'none', borderBottom: '3px solid #E50914', fontSize:'18px', fontWeight:'bold', cursor:'pointer', padding:'10px 15px' },
  loadMoreButton: { display: 'block', margin: '40px auto', padding: '12px 30px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid #fff', cursor: 'pointer', borderRadius:'4px', fontSize:'16px' },
  filterContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '40px', alignItems: 'start' },
  filterBox: { backgroundColor: 'var(--bg-card)', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', transition: 'all 0.3s ease' },
  filterHeader: { padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid #333', userSelect: 'none' },
  filterTitle: { fontSize: '14px', color: '#ddd', fontWeight: 'bold' },
  filterArrow: { color: '#666', fontSize: '12px' },
  filterContent: { padding: '15px', display: 'flex', flexWrap: 'wrap', gap: '8px', backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border)' },
  tagBtn: { backgroundColor: 'var(--bg-hover)', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer', transition: '0.2s' },
  tagBtnActive: { backgroundColor: '#E50914', borderColor: '#E50914', color: 'white', fontWeight: 'bold', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'pointer' },
  tagBtnDisabled: { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-disabled)', padding: '6px 12px', borderRadius: '15px', fontSize: '12px', cursor: 'not-allowed', opacity: 0.5 },
  heartBtn: { position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', zIndex: 5 },
  navBar: { width: '100%', backgroundColor: '#000000', padding: '15px 4%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box', borderBottom: '1px solid #333', position:'sticky', top:0, zIndex:1000 },
  searchContainer: { position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' },
  clearButton: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#999', fontSize: '18px', cursor: 'pointer' },
  suggestionsList: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#141414', border: '1px solid #333', listStyle: 'none', padding: 0, margin: 0, zIndex: 1000, marginTop:'5px', maxHeight:'420px', overflowY:'auto' },
  suggestionItem: { padding: '10px 15px', cursor: 'pointer', color: '#fff', borderBottom: '1px solid #222' },
  suggestionItemSelected: { padding: '10px 15px', cursor: 'pointer', color: '#fff', backgroundColor: '#333', fontWeight: 'bold', borderBottom: '1px solid #222' },
  clearHistoryButton: { padding: '10px', cursor: 'pointer', color: '#E50914', textAlign: 'center', fontSize: '13px' },
  rightGroup: { display: 'flex', alignItems: 'center', gap: '15px' },
  regionSelect: { backgroundColor: '#000', color: '#fff', border: '1px solid #555', padding: '5px', borderRadius: '4px', fontSize: '13px' },
  suggestionGameRow: { display:'flex', alignItems:'center', gap:'10px', width:'100%' },
  suggestionThumb: { width:'56px', height:'32px', objectFit:'cover', borderRadius:'4px', flexShrink:0, backgroundColor:'#222', border:'1px solid #333' },
  suggestionTextWrap: { display:'flex', flexDirection:'column', minWidth:0, flex:1 },
  suggestionTitle: { color:'#fff', fontSize:'14px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  suggestionSubtitle: { color:'#888', fontSize:'12px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:'2px' },
  historyRow: { display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px' },
  historyDelete: { color:'#999', cursor:'pointer', fontSize:'14px', flexShrink:0 },
  highlightText: { fontWeight: '800', color: '#fff' },
  bellIcon: { background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer', position: 'relative' },
  badge: { position: 'absolute', top: '-5px', right: '-5px', backgroundColor: '#E50914', color: '#fff', fontSize: '10px', fontWeight: 'bold', borderRadius: '50%', padding: '2px 6px' },
  notiDropdown: { position: 'absolute', top: '120%', right: 0, backgroundColor: '#202020', border: '1px solid #444', borderRadius: '8px', width: '300px', maxHeight: '400px', overflowY: 'auto', zIndex: 1001, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', overflow: 'hidden' },
  notiItem: { padding: '12px 15px', borderBottom: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '5px', textDecoration: 'none' },
  notiTitle: { color: '#fff', fontSize: '14px', fontWeight: 'bold' },
  notiMessage: { color: '#aaa', fontSize: '12px', lineHeight: '1.4' },
  headerNickname: { color: '#fff', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap

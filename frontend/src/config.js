import axios from 'axios';

// '/api'가 중복으로 붙지 않도록 포트번호까지만 남깁니다.
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// 새롭게 추가한 세션/쿠키 통신용 글로벌 인스턴스 (이 인스턴스를 쓸 때만 자동으로 /api가 붙음)
export const apiClient = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    }
});

// 호환성을 위한 fallback
export default API_BASE_URL;
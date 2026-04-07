import axios from 'axios';

// 팩트: 환경 변수에 의존하지 않고, 브라우저가 현재 접속 중인 도메인을 직접 판별
export const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : 'https://playforyou.net';

export const apiClient = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    }
});

export default API_BASE_URL;
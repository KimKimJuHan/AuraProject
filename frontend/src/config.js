import axios from 'axios';

// AWS IP 하드코딩 제거. 환경 변수가 없으면 로컬호스트(개발 환경)로 폴백.
// AWS 서버에서는 .env 파일에 REACT_APP_API_URL=http://43.200.122.206:8000 을 주입합니다.
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    }
});

export default API_BASE_URL;
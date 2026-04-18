const axios = require('axios');

// 1. 디스코드 웹훅 알림 기능 (에러 발생 시 관리자 폰으로 즉각 알림)
async function sendDiscordAlert(title, message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        await axios.post(webhookUrl, {
            embeds: [{
                title: `🚨 [AuraProject 에러 경고] ${title}`,
                description: message,
                color: 16711680, // 빨간색
                timestamp: new Date().toISOString()
            }]
        });
    } catch (e) {
        console.error("디스코드 알림 발송 실패:", e.message);
    }
}

// 2. Axios 자동 재시도 인터셉터 (429 Too Many Requests 에러 방어)
function setupAxiosRetry() {
    axios.interceptors.response.use(
        response => response,
        async error => {
            const config = error.config;
            config.retryCount = config.retryCount || 0;
            const maxRetries = 3; 

            // 429(너무 많은 요청) 에러 발생 시 자동 재시도
            if (config.retryCount < maxRetries && error.response && error.response.status === 429) {
                config.retryCount += 1;
                // 지수 백오프: 2초, 4초, 8초 점진적 대기
                const backoff = Math.pow(2, config.retryCount) * 1000;
                console.warn(`[API 429 차단 감지] ${backoff/1000}초 대기 후 재시도 (${config.retryCount}/${maxRetries})...`);
                
                await new Promise(resolve => setTimeout(resolve, backoff));
                return axios(config); // 실패했던 요청 그대로 재요청
            }
            return Promise.reject(error);
        }
    );
}

module.exports = { sendDiscordAlert, setupAxiosRetry };
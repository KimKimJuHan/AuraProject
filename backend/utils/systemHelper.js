const axios = require('axios');

/**
 * 디스코드 웹훅 알림 기능
 * @param {string} title - 알림 제목
 * @param {string} message - 알림 내용
 * @param {'error'|'warn'|'info'} level - 심각도 (기본: error)
 */
async function sendDiscordAlert(title, message, level = 'error') {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return; // 환경변수 없으면 조용히 스킵

    const colorMap = { error: 16711680, warn: 16744272, info: 3447003 }; // 빨강, 주황, 파랑
    const emojiMap = { error: '🚨', warn: '⚠️', info: 'ℹ️' };

    try {
        await axios.post(webhookUrl, {
            embeds: [{
                title: `${emojiMap[level]} [AuraProject] ${title}`,
                description: message,
                color: colorMap[level] ?? colorMap.error,
                timestamp: new Date().toISOString(),
                footer: { text: `서버: ${process.env.NODE_ENV || 'development'}` }
            }]
        }, { timeout: 5000 });
    } catch (e) {
        console.error('[Discord] 알림 발송 실패:', e.message);
    }
}

/**
 * Axios 전역 재시도 인터셉터
 * - 429 Too Many Requests: 지수 백오프 재시도
 * - 5xx 서버 오류: 1회 재시도
 * - 400/403: 재시도 안 함 (요청 자체가 잘못된 것)
 */
function setupAxiosRetry() {
    axios.interceptors.response.use(
        response => response,
        async error => {
            const config = error.config;
            if (!config) return Promise.reject(error);
            config.retryCount = config.retryCount || 0;
            const status = error.response?.status;
            const maxRetries = 3;

            // 429: 지수 백오프 (2→4→8초)
            if (config.retryCount < maxRetries && status === 429) {
                config.retryCount += 1;
                const backoff = Math.pow(2, config.retryCount) * 1000;
                console.warn(`[Retry] 429 차단 → ${backoff / 1000}s 대기 후 재시도 (${config.retryCount}/${maxRetries})`);
                await new Promise(r => setTimeout(r, backoff));
                return axios(config);
            }

            // 5xx 서버 오류: 1회만 재시도
            if (config.retryCount < 1 && status >= 500) {
                config.retryCount += 1;
                console.warn(`[Retry] ${status} 서버 오류 → 3s 후 1회 재시도`);
                await new Promise(r => setTimeout(r, 3000));
                return axios(config);
            }

            return Promise.reject(error);
        }
    );
}

module.exports = { sendDiscordAlert, setupAxiosRetry };
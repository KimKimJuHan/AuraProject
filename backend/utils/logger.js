/**
 * logger.js - 외부 의존성 없는 파일 로거
 * 에러/경고를 콘솔 + 파일(logs/error.log)에 기록.
 * winston 없이 EC2에서 장애 추적 가능하도록 최소 구현.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

// 로그 디렉토리 생성 (없으면)
try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
    console.error('로그 디렉토리 생성 실패:', e.message);
}

function timestamp() {
    return new Date().toISOString();
}

function writeToFile(filename, line) {
    try {
        fs.appendFileSync(path.join(LOG_DIR, filename), line + '\n');
    } catch (e) {
        // 파일 쓰기 실패해도 서버는 계속 동작
    }
}

const logger = {
    error(msg, meta = {}) {
        const line = `[${timestamp()}] [ERROR] ${msg} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        console.error(line);
        writeToFile('error.log', line);
    },
    warn(msg, meta = {}) {
        const line = `[${timestamp()}] [WARN] ${msg} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        console.warn(line);
        writeToFile('error.log', line);
    },
    info(msg, meta = {}) {
        const line = `[${timestamp()}] [INFO] ${msg} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        console.log(line);
    },
};

module.exports = logger;
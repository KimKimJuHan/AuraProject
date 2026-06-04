// backend/middleware/errorHandler.js
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error(`${req.method} ${req.url}`, { message: err.message, stack: err.stack?.split('\n')[0] });

    const statusCode = err.statusCode || 500;
    const message = err.message || '서버 내부 에러가 발생했습니다.';

    // 프론트엔드가 일관되게 에러를 파싱할 수 있는 규격
    res.status(statusCode).json({
        success: false,
        error: {
            code: statusCode,
            message: message
        }
    });
};

module.exports = errorHandler;
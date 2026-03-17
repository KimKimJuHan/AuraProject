// backend/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
    console.error(`[Error] ${req.method} ${req.url} :`, err.message);

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
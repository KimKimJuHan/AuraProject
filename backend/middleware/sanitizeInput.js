/**
 * NoSQL Injection 방어 미들웨어
 *
 * 문제: 클라이언트가 JSON 본문에 {"code": {"$ne": null}} 같은 객체를 보내면
 *       Otp.findOne({ email, code }) 가 "code가 null이 아닌 문서"로 해석되어
 *       인증 코드 없이 OTP 검증을 통과할 수 있다.
 *
 * 왜 mongoose.set('sanitizeFilter', true) 를 쓰지 않는가:
 *       전역 sanitizeFilter는 서버 코드가 직접 만든 { price: { $gt: 5 } }, { $in: [...] }
 *       같은 정상 쿼리까지 { $eq: {...} } 로 감싸 버려서 추천·검색 기능이 전부 깨진다.
 *       (mongoose 8.24에서 직접 확인) → 신뢰할 수 없는 "입력"만 정리하는 것이 맞다.
 *
 * 동작: req.body / req.query / req.params 에서 '$'로 시작하거나 '.'을 포함한 키를
 *       재귀적으로 제거한다. (express-mongo-sanitize 와 같은 방식, 의존성 없이 구현)
 */

const MAX_DEPTH = 20;

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

function stripOperators(value, depth = 0) {
  if (depth > MAX_DEPTH) return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = stripOperators(value[i], depth + 1);
    }
    return value;
  }

  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
      } else {
        value[key] = stripOperators(value[key], depth + 1);
      }
    }
  }
  return value;
}

const sanitizeInput = (req, _res, next) => {
  // Express 4: req.body / req.query / req.params 모두 수정 가능한 객체
  if (req.body) stripOperators(req.body);
  if (req.query) stripOperators(req.query);
  if (req.params) stripOperators(req.params);
  next();
};

module.exports = { sanitizeInput, stripOperators };

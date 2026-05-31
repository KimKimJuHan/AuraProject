/**
 * simpleCache.js - 외부 의존성 없는 인메모리 TTL 캐시
 * Redis 없이 EC2 단일 인스턴스에서 추천/무료배포 API 부하 감소용
 */

class SimpleCache {
    constructor() {
        this.store = new Map();
        // 5분마다 만료된 항목 정리 (메모리 누수 방지)
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
        if (this.cleanupInterval.unref) this.cleanupInterval.unref();
    }

    /**
     * @param {string} key
     * @param {number} ttlMs - 유효 시간(ms)
     * @returns {any|null}
     */
    get(key) {
        const item = this.store.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.store.delete(key);
            return null;
        }
        return item.value;
    }

    set(key, value, ttlMs = 60000) {
        this.store.set(key, { value, expiry: Date.now() + ttlMs });
    }

    delete(key) {
        this.store.delete(key);
    }

    // 특정 prefix로 시작하는 키 전체 삭제 (예: 유저 추천 갱신 시)
    deleteByPrefix(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) this.store.delete(key);
        }
    }

    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.store.entries()) {
            if (now > item.expiry) this.store.delete(key);
        }
    }

    // 캐시 래퍼: 있으면 반환, 없으면 fn 실행 후 저장
    async wrap(key, ttlMs, fn) {
        const cached = this.get(key);
        if (cached !== null) return cached;
        const result = await fn();
        this.set(key, result, ttlMs);
        return result;
    }
}

module.exports = new SimpleCache();
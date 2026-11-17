FROM node:20-alpine
WORKDIR /usr/src/app

# 의존성만 먼저 복사 (레이어 캐시 활용)
COPY package*.json ./
# package-lock.json 기준으로 정확히 같은 버전 설치 (재현 가능한 빌드)
RUN npm ci --omit=dev

COPY . .

EXPOSE 8000

# 메모리 제한 (EC2 t2/t3.small 기준 512MB)
CMD ["node", "--max-old-space-size=512", "index.js"]

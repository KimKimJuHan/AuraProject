# Node.js 18 버전 (LTS) 경량화 이미지 사용
FROM node:18-alpine

# 컨테이너 내 작업 디렉토리 설정
WORKDIR /usr/src/app

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm install

# 백엔드 전체 코드 복사
COPY . .

# 8000번 포트 노출
EXPOSE 8000

# 서버 실행 명령어
CMD ["npm", "start"]
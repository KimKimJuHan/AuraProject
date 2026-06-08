# Stage 1: 빌드
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
ENV GENERATE_SOURCEMAP=false
ENV NODE_OPTIONS="--max_old_space_size=1024"
RUN npm run build

# Stage 2: nginx로 정적 파일 서빙 (개발 서버 제거)
FROM nginx:alpine
COPY --from=builder /usr/src/app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]

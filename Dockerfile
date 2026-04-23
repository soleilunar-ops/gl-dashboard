# GL 하루온 Ecount 크롤 서비스 — Railway 전용 Dockerfile
#
# Playwright 공식 이미지(Chromium + 모든 시스템 의존성 포함)에서 시작해
# Node 의존성만 설치 후 Hono 서버(services/crawl/server.ts)를 실행한다.
#
# 주의: 이 Dockerfile은 Next.js(Vercel) 배포와는 무관하며,
# Vercel은 src/app/** 만 자동 감지하므로 이 파일을 무시한다.

FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# 이미지에 Chromium 사전 설치됨 — npm install 시 중복 다운로드 방지
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# 의존성 먼저 복사해 레이어 캐시 최대화
COPY package.json package-lock.json ./
RUN npm ci --omit=optional

# 나머지 소스 복사 (tsconfig.json / services/ / src/lib/ 등)
# src/lib/ecount/* 를 import하므로 전체 src 복사 필요
COPY tsconfig.json ./
COPY services ./services
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "services/crawl/server.ts"]

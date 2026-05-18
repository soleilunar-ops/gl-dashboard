# (주)지엘 하루온 스마트 재고 시스템

핫팩 브랜드 **하루온**(GL·GL Pharm·HNB 3법인) 공용 재고·주문·판매 대시보드.
쿠팡·이카운트 ERP 데이터를 Supabase로 통합하고, LLM 기반 하루루 에이전트·주간 리포트·TTS 브리핑을 제공한다.

---

## 🏗️ 배포 구성 (Vercel + Railway + Supabase + GitHub Actions)

```
┌──────────────────────────────────────────┐
│  Vercel (Next.js 대시보드)                 │
│   └─ 모든 페이지 + Server API (크롤 제외)  │
└──────┬─────────────────┬───────────────────┘
       │                 │
┌──────▼────┐    ┌───────▼──────────────┐
│ Supabase  │    │ Railway (Node 크롤)  │
│ ・DB + RLS │    │  └─ Hono HTTP API    │
│ ・Edge Fn  │    │     (수동 크롤)        │
│ ・pg_cron  │    └──────────────────────┘
│ ・Storage  │
└───────────┘
      ▲
      │  매일 03:00 KST Python 크롤
┌─────┴──────────────────┐
│  GitHub Actions         │
│  └─ scripts/ecount_*.py │
└─────────────────────────┘
```

- **Vercel**: 프런트 + `/api/*` Route Handlers (크롤 제외한 전부)
- **Railway**: `services/crawl/*` Hono 서버 (수동 단일/배치 크롤 엔드포인트, Playwright 전용)
- **Supabase**: DB·인증·Edge Functions(하루루 agent / 주간 브리프 / TTS / RAG)·pg_cron
- **GitHub Actions**: 매일 03:00 KST Ecount Python 크롤 (구매·판매·생산입고)

---

## 🚀 주요 기능

| 경로                    | 기능                                         | 핵심 구성                                                          |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `/`                     | 랜딩 (하루루 AI 에이전트 + 시간대 인사)      | HomeHero, useHaruruAgent, PNG 시퀀스 마스코트                      |
| `/dashboard`            | 메인 브리핑 + 주간 리포트                    | BriefingCard (날씨·재고·액션 3열), WeeklyBriefCard (Supertone TTS) |
| `/orders`               | 주문 관리 (이카운트 연동)                    | OrderDashboard, OrdersStockSidebar, 엑셀 업로드·승인 흐름          |
| `/logistics`            | 재고·입출고·리드타임·쿠팡 밀크런·재작업 날씨 | LogisticsPage 외 4개 서브 페이지                                   |
| `/analytics/cost`       | 마진 산출 (9필드 단순화)                     | CostMain, ChannelTable, ChannelMarginChart                         |
| `/analytics/weatherkey` | 날씨별 핫팩 판매 시즌 분석                   | WeatherkeyDashboard, SeasonTimelineChart                           |
| `/upload`               | 엑셀 일괄 업로드 (광고비·쿠폰·납품·밀크런)   | UploadPanel + 6종 파서                                             |
| `/auth/login`           | Supabase 로그인                              | useAuth                                                            |

### 하루루 AI 에이전트

- Claude(Anthropic) + GPT(OpenAI) 멀티 모델
- SQL Tool Use로 Supabase 직접 조회 + RAG 문서 검색
- Edge Function `haruru-agent`

### 주간 리포트 + 음성 브리핑

- 매주 월 02:00 KST 자동 생성 (`rag-weekly-summary` pg_cron)
- Supertone TTS로 섹션별 오디오 청크 생성 (Edge Function `generate-weekly-audio`)
- 브라우저에서 AudioPlayerContext가 청크 이어재생 (iOS 호환)

### Ecount ERP 자동 크롤

- GH Actions 매일 03:00 KST
- 3법인 × 구매·판매(+ GL은 생산입고) 순차 크롤
- Playwright 로그인·엑셀 다운로드 → Supabase `ecount_*` 테이블 → DB 트리거로 `orders` 자동 생성

---

## ⚙️ 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.example` 복사:

```bash
cp .env.example .env.local
```

`.env.local` 채우기 — 아래 **환경변수 가이드** 섹션 참조.

### 3. 개발 서버 실행

```bash
npm run dev
```

→ http://localhost:3000

### 4. 빌드 검증

```bash
npm run build
npx tsc --noEmit
```

---

## 📋 NPM 스크립트

```bash
npm run dev                    # Next 개발 서버
npm run build                  # 프로덕션 빌드
npm run start                  # 빌드 결과 서빙
npm run lint                   # ESLint
npm run crawl:ecount           # Ecount 일일 배치 (Node, 로컬 테스트용)
npm run crawl:server           # Railway 크롤 HTTP 서버 로컬 실행
npm run parse:milkrun-centers  # 쿠팡 밀크런 센터 엑셀 파싱 스크립트
```

---

## 🔑 환경변수 가이드

### Vercel (대시보드 프론트)

| 이름                                      | 용도                                          | 필수 |
| ----------------------------------------- | --------------------------------------------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL`                | Supabase 프로젝트 URL                         | ✅   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`           | Supabase anon 키 (클라이언트)                 | ✅   |
| `SUPABASE_SERVICE_ROLE_KEY`               | Supabase service role (서버 전용)             | ✅   |
| `NEXT_PUBLIC_DASHBOARD_DATE`              | 대시보드 기준일 (시연용, `2026-12-03` 등)     | 선택 |
| `KMA_SERVICE_KEY`                         | 기상청 API 키                                 | ✅   |
| `EXCHANGE_RATE_KEY`                       | 환율 API 키                                   | ✅   |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 DataLab API                            | 선택 |
| `ANTHROPIC_API_KEY`                       | Claude API (쿠팡 SKU 분석 · 중국 공휴일 보강) | ✅   |
| `OPENAI_API_KEY`                          | OpenAI (보조 LLM)                             | 선택 |
| `ANTHROPIC_ANALYSIS_MODEL`                | 모델 오버라이드 기본값: `claude-haiku-4-5`    | 선택 |
| `ANTHROPIC_HOLIDAY_MODEL`                 | 모델 오버라이드 기본값: `claude-sonnet-4-5`   | 선택 |

### Supabase Edge Function Secrets

`supabase secrets set KEY=value --project-ref <ref>` 로 등록:

- `ANTHROPIC_API_KEY` (하루루 agent, 주간 브리프)
- `OPENAI_API_KEY` (Whisper STT, 임베딩)
- `SUPERTONE_API_KEY` (주간 리포트 TTS)

### GitHub Secrets (Actions 크롤용)

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ECOUNT_GL_COM_CODE` / `ECOUNT_GL_USER_ID` / `ECOUNT_GL_USER_PW`
- `ECOUNT_GLPHARM_COM_CODE` / `ECOUNT_GLPHARM_USER_ID` / `ECOUNT_GLPHARM_USER_PW`
- `ECOUNT_HNB_COM_CODE` / `ECOUNT_HNB_USER_ID` / `ECOUNT_HNB_USER_PW`
- (선택) `ECOUNT_GL_PRODUCTION_RECEIPT` — 생산입고조회 메뉴 URL 해시

### Railway (크롤 서비스)

위 GitHub Secrets와 동일 세트 + `CRAWL_SERVICE_SECRET` (대시보드 호출 시 X-Crawl-Secret 헤더).

---

## 📦 배포 순서 (처음 구축 시)

### 1. Supabase 마이그레이션·Edge Function

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy haruru-agent
supabase functions deploy generate-weekly-brief
supabase functions deploy generate-weekly-audio
supabase functions deploy transcribe-audio
supabase functions deploy rag-embed-missing
supabase secrets set ANTHROPIC_API_KEY=... OPENAI_API_KEY=... SUPERTONE_API_KEY=...
```

### 2. Vercel

- vercel.com/new → GitHub repo 연결
- Framework: Next.js 자동 감지
- Environment Variables 등록 (위 표)
- Deploy
- **Supabase Auth → URL Configuration** 에 Vercel 도메인 추가
  - Site URL + Redirect URLs (`<domain>`, `<domain>/auth/callback`)

### 3. Railway (크롤 서비스)

- railway.app/new → GitHub repo 연결
- Dockerfile 자동 감지 (Playwright 공식 이미지 기반)
- Variables 등록 (위 표)
- Generate Domain → `https://*.up.railway.app`
- `/health` GET → `{"status":"ok"}` 확인

### 4. GitHub Actions (자동 크롤)

- Settings → Secrets and variables → Actions → 위 ECOUNT\_\* 세트 등록
- Actions 탭 → `Ecount Python Daily Crawl` → Run workflow (수동 1회 검증)
- 매일 03:00 KST 자동 실행

---

## 🧪 개발 흐름

### 브랜치 전략

- `main` — 프로덕션 (Vercel·Railway 자동 배포)
- `submain` — 통합 스테이징
- `pm/*` — PM 작업 브랜치
- `team/슬아` / `team/나경` / `team/진희` — 팀원 브랜치

### PR 흐름

`team/*` or `pm/*` → `submain` → `main`

### CI

- Lint + TypeScript + Build 자동 실행
- 파일 경계 검사 (`.github/workflows/ci.yml`) — 팀원이 자기 영역 외 수정 시 차단

---

## 📁 폴더 구조

```
src/
├── app/
│   ├── (dashboard)/        라우트 그룹 (layout 공유)
│   │   ├── page.tsx        /  랜딩
│   │   ├── dashboard/      /dashboard
│   │   ├── orders/         /orders
│   │   ├── logistics/      /logistics
│   │   ├── analytics/      /analytics/cost, /analytics/weatherkey
│   │   └── upload/         /upload
│   ├── auth/login/         로그인
│   └── api/                Next.js API Route Handlers
├── components/
│   ├── layout/             Sidebar, Header, PageWrapper
│   ├── ui/                 shadcn/ui 컴포넌트
│   ├── shared/             DataTable, StatCard, ExcelUploader 등
│   ├── dashboard/          HomeHero, DashboardMain, HaruruCharacter
│   ├── briefing/           BriefingCard + 3열 (날씨/재고/액션)
│   ├── weekly-brief/       WeeklyBriefCard, Modal, AudioMiniPlayer
│   ├── haruru/             HaruruConversation, HaruruMessage, ModelPicker
│   ├── orders/             OrderDashboard (슬아)
│   ├── logistics/          재고 현황, 리드타임, 밀크런 (진희)
│   └── analytics/
│       ├── cost/           마진 산출 (슬아)
│       ├── reviews/        리뷰 (나경)
│       ├── promotion/      프로모션 엑셀 업로드 (나경)
│       └── weatherkey/     날씨별 판매 (지호)
├── contexts/               AudioPlayerContext
├── lib/                    Supabase 클라이언트, ecount, utils, demo 데이터
└── proxy.ts                Next.js 16 세션 검증 미들웨어

services/
└── crawl/                  Railway Node 크롤 서비스 (Hono + Playwright)

scripts/                    Python 크롤 파이프라인 + 유틸
├── ecount_crawler.py       단일 메뉴 CLI
├── ecount_multi_pipeline.py  통합 파이프라인 (company별 분기)
├── ecount_steps/           구매·판매·생산입고 크롤러 (법인별)
└── ...

supabase/
├── functions/              Edge Functions (haruru-agent 등 5개)
├── migrations/             SQL 마이그레이션
└── types.ts                자동 생성 타입

.github/workflows/          CI + 일일 크롤
```

---

## 👥 팀 영역 (파일 경계)

CI가 자동 검사. 자세한 내용: `.claude/rules/file-boundaries.md`

| 팀원        | 담당 영역                                                                             |
| ----------- | ------------------------------------------------------------------------------------- |
| **PM 지호** | `layout/`, `ui/`, `shared/`, `lib/`, `app/api/`, `supabase/`, `services/`, `.github/` |
| **슬아**    | `orders/`, `analytics/cost/`                                                          |
| **나경**    | `analytics/reviews/`, `analytics/promotion/`                                          |
| **진희**    | `logistics/`                                                                          |

팀원 영역 외 수정 필요 시 PM 요청.

---

## 🔧 로컬 트러블슈팅

| 증상                                   | 해결                                |
| -------------------------------------- | ----------------------------------- |
| 빌드 시 "Module not found: playwright" | `npm install` 재실행                |
| 로그인 후 `/` 무한 리다이렉트          | Supabase Auth Redirect URL 미등록   |
| 대시보드 빈 화면                       | `NEXT_PUBLIC_SUPABASE_*` 값 확인    |
| 하루루 에이전트 500                    | Edge Function 미배포 or 시크릿 누락 |
| Ecount 크롤 "prgId 미설정"             | 해당 메뉴 URL 해시 env 등록 필요    |

---

## 📚 추가 문서

- `CLAUDE.md` — Claude Code 전용 규칙
- `PROJECT_RULES.md` — 팀 프로젝트 규칙
- `docs/` — 설계 문서·작업 로그·DB 스키마
- `.claude/rules/` — 코딩 스타일·파일 경계·작업 로그 규칙

---

## 📝 라이선스

사내 프로젝트 (비공개).

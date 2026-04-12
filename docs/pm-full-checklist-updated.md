# PM 작업 전체 체크리스트 — 이틀 내 완료

> 목표: 팀원이 git clone 한 번으로 완벽한 환경에서 바로 코딩 시작
> 기간: D+0 (오늘) ~ D+1 (내일)
> D+2: 팀원 코딩 시작

---

## D+0 오전: 프로젝트 초기화 (약 2시간)

### 1단계: Supabase 파악 (30분)

```
□ Supabase 가입 (https://supabase.com)
□ 프로젝트 생성 (이름: gl-dashboard-dev, 리전: Northeast Asia - ap-northeast-1)
□ 비밀번호 메모 (분실 시 리셋 필요)
□ Project URL 메모 (Settings → API)
□ anon public key 메모 (Settings → API)
□ service_role key 메모 (Settings → API) ← 절대 프론트에 노출 금지
□ Table Editor 둘러보기 (테이블 하나 만들어보고 삭제)
□ SQL Editor 둘러보기 (SELECT 1; 실행해보기)
□ Extensions에서 pgvector 활성화 (Database → Extensions → vector 검색 → Enable)
□ Auth 설정 둘러보기 (Authentication → Settings)
```

### 2단계: GitHub 레포 + Next.js 초기화 (20분)

```
□ GitHub에 gl-dashboard 레포 생성 (private)
□ 로컬에서 프로젝트 생성:
  npx create-next-app@latest gl-dashboard \
    --typescript --tailwind --eslint --app --src-dir \
    --import-alias "@/*"
□ cd gl-dashboard
□ git remote add origin https://github.com/[팀계정]/gl-dashboard.git
```

### 3단계: 폴더 뼈대 생성 (10분)

```
□ init-structure.sh 작성 & 실행:

#!/bin/bash
# 데이터
mkdir -p data/{raw/{coupang,weather,erp,documents},processed,embeddings,scripts}

# Supabase
mkdir -p supabase/migrations

# 소스 — 공용
mkdir -p src/lib/{supabase,hooks}
mkdir -p src/types

# 소스 — 컴포넌트
mkdir -p src/components/layout
mkdir -p src/components/orders/_hooks
mkdir -p src/components/analytics/forecast/_hooks
mkdir -p src/components/analytics/promotion
mkdir -p src/components/analytics/reviews/_hooks
mkdir -p src/components/analytics/cost/_hooks
mkdir -p src/components/analytics/reports
mkdir -p src/components/logistics/_hooks
mkdir -p src/components/people
mkdir -p src/components/shared

# 소스 — 페이지
mkdir -p src/app/auth/{login,callback}
mkdir -p src/app/orders/{new,returns}
mkdir -p "src/app/orders/[id]"
mkdir -p src/app/analytics/{forecast,reviews,reports,cost}
mkdir -p src/app/logistics/{inbound,outbound}
mkdir -p src/app/people
mkdir -p src/app/api/export

# FastAPI
mkdir -p services/api/{routers,models,rag,utils}

# 하네스
mkdir -p .claude/{hooks,rules,skills/supabase-crud}
mkdir -p .cursor/rules

# GitHub Actions
mkdir -p .github/workflows

# 기타
mkdir -p scripts docs __tests__ .vscode

# 빈 폴더에 .gitkeep
for dir in data/raw/{coupang,weather,erp,documents} data/processed data/embeddings \
  src/components/analytics/promotion src/components/analytics/cost \
  src/components/analytics/reports src/components/people src/app/people __tests__ \
  services/api/rag; do
  touch "$dir/.gitkeep"
done

echo "✅ 폴더 구조 생성 완료"

□ chmod +x init-structure.sh && ./init-structure.sh
□ create-next-app이 자동 생성한 불필요 파일 정리:
  rm -f src/app/page.module.css src/app/favicon.ico
```

### 4단계: npm 패키지 설치 (20분)

```
□ A) Supabase
  npm install @supabase/supabase-js @supabase/ssr

□ B) shadcn/ui 초기화
  npx shadcn@latest init
  → style: Default / base color: Slate / CSS variables: Yes

□ C) shadcn/ui 컴포넌트 13개
  npx shadcn@latest add button card table input select \
    dialog tabs badge toast skeleton dropdown-menu alert chart

□ D) 코드 품질 도구
  npm install -D prettier eslint-config-prettier prettier-plugin-tailwindcss
  npm install -D @secretlint/secretlint-rule-preset-recommend secretlint
  npm install -D lint-staged

□ E) Husky (Git Hook)
  npm install -D husky
  npx husky init

□ F) 추가 유틸
  npm install date-fns recharts lucide-react

□ G) Supabase CLI (타입 생성용)
  npm install -D supabase
```

### 5단계: Git 초기 설정 (10분)

```
□ .gitignore 작성:
  node_modules/
  .next/
  .env.local
  .env
  data/raw/
  data/processed/
  data/embeddings/
  .venv/
  __pycache__/
  *.pyc

□ .env.example 작성:
  # === 프론트엔드 (브라우저 노출 OK) ===
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=

  # === 서버 전용 ===
  SUPABASE_SERVICE_ROLE_KEY=
  FASTAPI_URL=http://localhost:8000

  # === dev/prod 구분 ===
  # dev: https://[dev-project].supabase.co
  # prod: https://[prod-project].supabase.co (Pro 결제 후)

□ .env.local 작성 (실제 키 값 입력):
  NEXT_PUBLIC_SUPABASE_URL=https://[프로젝트ID].supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon key]
  SUPABASE_SERVICE_ROLE_KEY=[service role key]
  FASTAPI_URL=http://localhost:8000
```

---

## D+0 오후-1: 코드 품질 설정 (약 1시간)

### 6단계: ESLint 설정 (10분)

```
□ .eslintrc.json 작성:
{
  "extends": ["next/core-web-vitals", "prettier"],
  "plugins": ["prettier"],
  "rules": {
    "prettier/prettier": "error",
    "eqeqeq": "warn",
    "no-console": "warn",
    "no-unused-vars": "warn"
  }
}

□ .eslintignore 작성:
  .next/
  node_modules/
  supabase/types.ts
  public/
```

### 7단계: Prettier 설정 (5분)

```
□ .prettierrc.json 작성:
{
  "tabWidth": 2,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}

□ .prettierignore 작성:
  .next/
  node_modules/
  package-lock.json
  supabase/types.ts
```

### 8단계: secretlint 설정 (5분)

```
□ .secretlintrc.json 작성:
{
  "rules": [
    { "id": "@secretlint/secretlint-rule-preset-recommend" }
  ],
  "ignorePatterns": [".env.local", ".env"]
}
```

### 9단계: Husky pre-commit (10분)

```
□ .husky/pre-commit 작성:
#!/bin/sh

echo "🔍 [1/3] 비밀키 검사 중..."
npx secretlint $(git diff --cached --name-only --diff-filter=ACM) || {
  echo ""
  echo "❌ 비밀키가 감지되었습니다! 커밋 차단."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "💡 .env.local에 넣고 process.env.변수명으로 사용하세요."
  exit 1
}

echo "🧹 [2/3] 코드 정리 중..."
npx lint-staged || {
  echo ""
  echo "❌ 린트/포맷 에러가 있습니다! 커밋 차단."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "💡 위 에러를 AI에게 복사해서 '이 에러 고쳐줘'라고 요청하세요."
  exit 1
}

echo "📋 [3/3] 규칙 동기화 확인 중..."
if git diff --cached --name-only | grep -q "PROJECT_RULES.md"; then
  if ! diff -q PROJECT_RULES.md .cursorrules > /dev/null 2>&1; then
    echo "⚠️ PROJECT_RULES.md가 변경됐지만 .cursorrules와 동기화되지 않았습니다."
    echo "💡 scripts/sync-rules.sh를 실행하세요."
    exit 1
  fi
fi

echo "✅ 커밋 검사 통과!"

□ chmod +x .husky/pre-commit

□ package.json에 lint-staged 설정 추가:
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
```

### 10단계: 에디터 설정 (5분)

```
□ .vscode/settings.json 작성:
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}

□ .vscode/extensions.json 작성:
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "supabase.supabase-vscode"
  ]
}
```

---

## D+0 오후-2: 하네스 + 규칙 파일 (약 1시간)

### 11단계: CLAUDE.md (15분)

```
□ CLAUDE.md 작성 (30줄 이내):

# (주)지엘 하루온 스마트 재고 시스템

## 기술 스택
Next.js + Tailwind + shadcn/ui + Supabase + FastAPI(AI전용)

## 절대 규칙
1. 새 파일은 반드시 src/components/[본인영역]/ 안에 생성
2. 다른 팀원의 components 폴더 파일 수정 금지
3. page.tsx는 컴포넌트를 import해서 배치만
4. Supabase 타입은 @/lib/supabase/types에서 import
5. .env 값을 코드에 직접 넣지 않기
6. 커밋 전 브라우저에서 기능 동작 확인

## 팀원 영역
- 슬아: components/orders/, components/analytics/promotion/
- 정민: components/analytics/forecast/, services/api/routers/forecast.py
- 나경: components/analytics/reviews/, components/analytics/cost/
- 진희: components/logistics/

## 상세 규칙 → .claude/rules/ 참조
```

### 12단계: PROJECT_RULES.md + 동기화 (15분)

```
□ PROJECT_RULES.md 작성 (전체 규칙 포함):
  — 프로젝트 개요
  — 기술 스택
  — 폴더 규칙 + 팀원별 영역
  — 코딩 컨벤션 (camelCase/PascalCase/snake_case)
  — 커밋 규칙 ([담당자] type: 설명)
  — DB 규칙 (컬럼 추가 → 팀 채널 알림)
  — 컴포넌트 원칙 (_hooks 패턴)
  — Git 브랜치 전략

□ scripts/sync-rules.sh 작성:
#!/bin/bash
RULES=$(cat PROJECT_RULES.md)
echo "$RULES" > .cursorrules
echo "$RULES" > GEMINI.md
cp .claude/rules/code-style.md .cursor/rules/code-style.md
cp .claude/rules/file-boundaries.md .cursor/rules/file-boundaries.md
echo "✅ .cursorrules, GEMINI.md, .cursor/rules/ 동기화 완료"
echo "⚠️ CLAUDE.md는 별도 관리 (30줄 요약본)"

□ chmod +x scripts/sync-rules.sh
□ ./scripts/sync-rules.sh 실행
```

### 13단계: .claude/ 하네스 파일 (20분)

```
□ .claude/settings.json 작성:
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Create",
        "hooks": [{
          "type": "command",
          "command": "bash .claude/hooks/check-boundary.sh",
          "timeout": 5
        }]
      }
    ]
  }
}

□ .claude/hooks/check-boundary.sh 작성:
#!/bin/bash
FILE="$CLAUDE_FILE_PATH"
if echo "$FILE" | grep -qE "^(CLAUDE\.md|supabase/|data/|src/lib/|src/components/ui/|src/components/layout/)"; then
  echo '{"message": "⚠️ PM 관리 영역입니다. PM에게 요청하세요."}' >&2
fi

□ chmod +x .claude/hooks/check-boundary.sh

□ .claude/rules/code-style.md 작성:
  — 변수명: camelCase (TS), snake_case (Python)
  — 컴포넌트: PascalCase (OrderListTable.tsx)
  — 상수: UPPER_SNAKE_CASE
  — import 순서: React → 외부 → @/components/shared → @/components/[영역] → @/lib
  — Supabase: 단순 CRUD는 프론트 직접, AI/RAG만 FastAPI
  — 한국어 주석 사용

□ .claude/rules/file-boundaries.md 작성:
  — PM 전용 영역 목록
  — 각 팀원 전용 영역 목록
  — 공용 영역 (shared/ — 수정 시 PR)
  — 경계 이탈 시 대응 방법

□ .claude/skills/supabase-crud/SKILL.md 작성:
  — 기본 조회 패턴 (select, filter, order)
  — 타입 안전 패턴 (Database['public']['Tables'] 사용)
  — 연결 조회 패턴 (JOIN: select('*, products(*)'))
  — 에러 처리 패턴
  — RPC 호출 패턴 (supabase.rpc('함수명'))
```

### 14단계: .cursor/ 규칙 복사 (2분)

```
□ cp .claude/rules/code-style.md .cursor/rules/code-style.md
□ cp .claude/rules/file-boundaries.md .cursor/rules/file-boundaries.md
```

---

## D+0 저녁: 문서 + 첫 커밋 (약 1시간)

### 15단계: team-guide.md 작성 (30분)

```
□ docs/team-guide.md 작성:

  === 환경 세팅 (최초 1회) ===
  git clone https://github.com/[팀계정]/gl-dashboard.git
  cd gl-dashboard
  npm install
  .env.local 파일 생성 (Notion 링크에서 내용 복사)
  npm run dev → http://localhost:3000 확인

  === 내 브랜치에서 코딩 ===
  git checkout feat/orders-슬아      (본인 브랜치)
  git pull origin submain             (매일 아침)
  → AI에게 코딩 요청
  → 브라우저에서 기능 확인
  git add .
  git commit -m "[슬아] feat: 주문 목록 추가"
  git push origin feat/orders-슬아
  → GitHub에서 submain으로 PR 생성
  → PM이 오전 11시/오후 5시에 리뷰

  === pre-commit 에러 시 ===
  에러 메시지 전체 복사 → AI에게 "이 에러 고쳐줘"
  수정 후 다시 git add . && git commit

  === 내 담당 폴더 ===
  슬아: src/components/orders/, src/app/orders/
  정민: src/components/analytics/forecast/, services/api/
  나경: src/components/analytics/reviews/, cost/
  진희: src/components/logistics/, src/app/logistics/

  === Supabase 데이터 가져오기 (첫 코드) ===
  _hooks/ 폴더의 스켈레톤 파일 참고
```

### 16단계: error-handling.md 작성 (15분)

```
□ docs/error-handling.md 작성:

  === 빌드 실패 (npm run build) ===
  에러 메시지를 AI에게 복사 → "이 빌드 에러 고쳐줘"

  === Git 충돌 ===
  PM에게 알리기. 직접 해결하지 마세요.
  PM이 submain에서 해결합니다.

  === Supabase 연결 안 됨 ===
  .env.local 파일이 있는지 확인
  NEXT_PUBLIC_SUPABASE_URL 값이 맞는지 확인
  Supabase 대시보드에서 프로젝트 상태 확인

  === pre-commit 에러 ===
  에러 메시지를 AI에게 복사 → "이 에러 고쳐줘"
  "비밀키 감지" → .env.local에 넣고 코드에서 process.env 사용
  "린트 에러" → AI가 자동 수정 제안해줌
```

### 17단계: 기타 설정 파일 (5분)

```
□ tailwind.config.ts에 디자인 토큰 추가:
  — 프로젝트 색상 (Behance 참고: behance.net/gallery/195365071)
  — 추후 design-system.md에서 상세 정의

□ scripts/generate-types.sh 작성:
#!/bin/bash
npx supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > supabase/types.ts
echo "✅ supabase/types.ts 재생성 완료"

□ scripts/setup-dev.sh 작성:
#!/bin/bash
echo "🚀 개발 환경 세팅 중..."
npm install
echo ""
echo "📋 .env.local 파일을 만들어주세요:"
echo "  Notion 링크: [팀 Notion URL]"
echo "  또는 PM에게 요청하세요."
echo ""
echo "✅ npm run dev로 시작하세요!"
```

### 18단계: 첫 커밋 + Push (10분)

```
□ git add .
□ git commit -m "[PM] init: 프로젝트 구조 v5 초기화"
□ git push -u origin main
□ git checkout -b submain
□ git push -u origin submain
```

---

## D+1 오전: DB 구축 (약 2~3시간)

### 19단계: 데이터 점검 (1시간)

```
□ 지엘에서 받은 데이터 파일 열어보기 (엑셀, CSV 등)
□ 어떤 컬럼이 있는지, 데이터 형식이 뭔지 파악
□ 필요한 테이블 컬럼 목록 정리
□ 이카운트 API 인증키 요청 (지엘 측에):
  "회사코드(6자리) + 사용자ID + API 인증키가 필요합니다.
   이카운트 → Self-Customizing → 정보관리 → API인증키발급"
□ 쿠팡 Supplier Hub 데이터 수집 방법 확인 (CSV 다운로드 가능 여부)
```

### 20단계: Supabase 테이블 생성 (1시간)

```
□ SQL Editor에서 migration 실행:

  001_init_core_tables.sql:
    — products (id, name, sku, category, unit_price, created_at)
    — inventory (id, product_id, quantity, min_safety_stock, updated_at)
    — users (id, email, name, role, created_at)

  002_add_orders_tables.sql:
    — orders (id, order_number, status, supplier_id, total_amount, order_date, ...)
    — invoices (id, order_id, invoice_number, incoterms, amount, ...)
    — bill_of_lading (id, order_id, bl_number, vessel, port, ...)

  003_add_analytics_tables.sql:
    — sales (id, product_id, quantity, date, channel, amount)
    — forecasts (id, product_id, predicted_qty, date, model, confidence)
    — promotions (id, name, start_date, end_date, discount_rate, ...)

  004_add_logistics_tables.sql:
    — stock_movements (id, product_id, type, quantity, date, source, note)

  005_add_people_tables.sql:
    — suppliers (id, name, contact, country, ...)
    — partners (id, name, contact, type, ...)

□ (시간 되면) 006~009도 실행:
  006: documents, document_chunks (RAG용)
  007: reviews, competitors
  008: alerts (트리거 RAG 결과)
  009: RPC functions (create_order_with_stock_update 등)
```

### 21단계: 더미 데이터 + types.ts (30분)

```
□ seed.sql 작성 & 실행:
  — products 5~10개 (하루온 미니, 레귤러, 맥스 등)
  — inventory 각 상품 재고 100~500개
  — sales 최근 6개월 일별 판매 데이터 (50~100건)
  — suppliers 2~3개 (상하이 제조사)
  — orders 5~10건 (테스트용)

□ types.ts 생성:
  npx supabase gen types typescript --project-id [프로젝트ID] > supabase/types.ts

□ git add . && git commit -m "[PM] feat: DB 스키마 + 더미 데이터"
□ git push origin submain
```

---

## D+1 오후: 프론트엔드 기반 코드 (약 2~3시간)

### 22단계: Supabase 클라이언트 파일 (20분)

```
□ src/lib/supabase/client.ts 작성:
  — createBrowserClient() 함수
  — @supabase/ssr 사용

□ src/lib/supabase/server.ts 작성:
  — createServerClient() 함수
  — 쿠키 기반 세션

□ src/lib/supabase/middleware.ts 작성:
  — updateSession() 함수

□ src/lib/supabase/types.ts 작성:
  — supabase/types.ts를 re-export
  — 팀원은 '@/lib/supabase/types'에서 import

□ src/middleware.ts 작성 (src/ 안에!):
  — updateSession() 호출
  — matcher 설정 (api, _next, 정적파일 제외)
```

### 23단계: 공용 유틸 (10분)

```
□ src/lib/utils.ts 작성:
  — cn() 함수 (shadcn/ui 필수 — 이미 shadcn init에서 생성됐을 수 있음)
  — formatDate(), formatNumber(), formatCurrency()

□ src/lib/constants.ts 작성:
  — FASTAPI_URL
  — 상태 코드 매핑 등

□ src/lib/hooks/useAuth.ts 작성:
  — 현재 로그인 사용자 정보 + role 확인

□ src/types/shared.ts 작성:
  — DataTableProps, ChartContainerProps, StatCardProps 등
  — shared/ 컴포넌트의 props 타입 정의
```

### 24단계: 레이아웃 (30분)

```
□ src/components/layout/Sidebar.tsx 작성:
  — navigation.config.ts의 메뉴 렌더링

□ src/components/layout/Header.tsx 작성:
  — 검색, 알림, 프로필

□ src/components/layout/PageWrapper.tsx 작성:
  — 제목, 브레드크럼

□ src/components/layout/navigation.config.ts 작성:
  — 팀원별 nav 파일을 import해서 합침

□ src/components/layout/nav-orders.ts 작성:
  — [{ label: '주문 관리', path: '/orders', icon: 'ShoppingCart' }]

□ src/components/layout/nav-forecast.ts 작성:
  — [{ label: '수요 예측', path: '/analytics/forecast', icon: 'TrendingUp' }]

□ src/components/layout/nav-reviews.ts 작성:
  — [{ label: '리뷰 분석', path: '/analytics/reviews', icon: 'MessageSquare' }]
  — [{ label: '원가 분석', path: '/analytics/cost', icon: 'Calculator' }]

□ src/components/layout/nav-logistics.ts 작성:
  — [{ label: '재고 관리', path: '/logistics', icon: 'Package' }]

□ src/app/layout.tsx 수정:
  — Sidebar + Header + children 조합
```

### 25단계: 인증 페이지 (20분)

```
□ src/app/auth/login/page.tsx 작성:
  — 이메일 + 비밀번호 로그인 폼
  — supabase.auth.signInWithPassword() 호출

□ src/app/auth/callback/route.ts 작성:
  — OAuth 콜백 처리

□ Supabase 대시보드에서 테스트 계정 생성:
  — supabase.auth.admin.createUser() 또는 대시보드 Auth → Users → Add user
  — role: 'admin' (user_metadata)
```

### 26단계: 메인 대시보드 (10분)

```
□ src/app/page.tsx 작성:
  — 임시 내용: "대시보드 메인 — 팀원 컴포넌트 완성 후 배치 예정"
  — 또는 간단한 환영 카드
```

### 27단계: \_hooks/ 스켈레톤 파일 (30분)

```
□ src/components/orders/_hooks/useOrders.ts:
  — 기본 조회 패턴 예시 (supabase.from('orders').select('*'))

□ src/components/analytics/forecast/_hooks/useForecast.ts:
  — FastAPI 호출 패턴 예시 (fetch(FASTAPI_URL + '/forecast'))

□ src/components/analytics/reviews/_hooks/useReviews.ts:
  — 기본 조회 패턴

□ src/components/analytics/cost/_hooks/useCost.ts:
  — 기본 조회 패턴

□ src/components/logistics/_hooks/useInventory.ts:
  — 기본 조회 패턴

□ src/components/logistics/_hooks/useStockMovements.ts:
  — 기본 조회 패턴

각 파일은 10~20줄 스켈레톤:
  import + useState + useEffect + supabase.from().select() + return { data, loading }
```

### 28단계: shared/ 컴포넌트 스켈레톤 (20분)

```
□ 핵심 5개만 최소 구현:
  — src/components/shared/DataTable.tsx (props: data, columns)
  — src/components/shared/ChartContainer.tsx (props: title, children, loading)
  — src/components/shared/StatCard.tsx (props: title, value, change)
  — src/components/shared/LoadingSpinner.tsx
  — src/components/shared/EmptyState.tsx (props: message)

□ 나머지 5개는 빈 파일 + TODO:
  — DateRangePicker, SearchBar, ExportDropdown, ErrorBoundary, ConfirmDialog
```

### 29단계: 커밋 (5분)

```
□ git add .
□ git commit -m "[PM] feat: 레이아웃 + 인증 + 공용 유틸 + 스켈레톤"
□ git push origin submain
```

---

## D+1 저녁: GitHub 설정 + 마무리 (약 1~2시간)

### 30단계: GitHub Actions (30분)

```
□ .github/workflows/ci.yml 작성:
  — trigger: pull_request (submain, main)
  — steps: checkout → npm install → tsc --noEmit → npm run build → eslint
  — 파일 경계 체크 스크립트 포함

□ .github/workflows/auto-types.yml 작성:
  — trigger: push (submain)
  — steps: checkout → supabase CLI → gen types → auto commit
  — permissions: contents: write
  — secrets: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_ID

□ GitHub Secrets 등록:
  — SUPABASE_ACCESS_TOKEN (Supabase → Account → Access tokens)
  — SUPABASE_PROJECT_ID (프로젝트 URL에서 추출)
```

### 31단계: Branch Protection (10분)

```
□ GitHub → Settings → Branches → Add rule:

  main:
  ✅ Require pull request before merging (1 approval)
  ✅ Require status checks (ci)

  submain:
  ✅ Require pull request before merging
  ✅ Require status checks (ci)

  ※ private repo면 GitHub Pro 필요. 안 되면 팀 규칙으로 대체:
    "main, submain에 직접 push하지 않기" (team-guide.md에 명시)
```

### 32단계: 팀원 브랜치 생성 (5분)

```
□ git checkout submain
□ git checkout -b feat/orders-슬아 && git push -u origin feat/orders-슬아
□ git checkout submain
□ git checkout -b feat/forecast-정민 && git push -u origin feat/forecast-정민
□ git checkout submain
□ git checkout -b feat/cost-나경 && git push -u origin feat/cost-나경
□ git checkout submain
□ git checkout -b feat/logistics-진희 && git push -u origin feat/logistics-진희
□ git checkout submain
□ git checkout -b data/pm-지호 && git push -u origin data/pm-지호
```

### 33단계: .env.local 팀원 전달 (10분)

```
□ Notion 프라이빗 페이지에 .env.local 내용 업로드
□ 팀원에게 링크 공유
□ 또는 team-guide.md에 "Supabase 대시보드에서 직접 키 복사" 안내
```

### 34단계: 최종 확인 (15분)

```
□ npm run dev → http://localhost:3000 접속 확인
□ 로그인 페이지 동작 확인
□ 사이드바 메뉴 표시 확인
□ Supabase 데이터 연결 확인 (콘솔에서 에러 없는지)
□ git status → 커밋 안 된 파일 없는지 확인
□ 다른 컴퓨터에서 clone → npm install → npm run dev 테스트 (가능하면)
```

### 35단계: 최종 커밋 (5분)

```
□ git add .
□ git commit -m "[PM] chore: GitHub Actions + 브랜치 설정 완료"
□ git push origin submain

□ submain → main PR 생성 & 병합 (초기 버전)
```

---

## D+2: 팀원 코딩 시작

```
□ 팀원에게 안내:
  "gl-dashboard 레포를 clone하세요.
   team-guide.md를 읽고 따라하면 됩니다.
   본인 브랜치에서 코딩 시작하세요."

□ PM은 이후 작업에 집중:
  — RAG 파이프라인 설계 (services/api/rag/)
  — FastAPI 기본 세팅 (main.py, CORS, JWT 검증)
  — 이카운트 API 연동 테스트
  — design-system.md 작성
  — deployment.md 작성
```

---

## 전체 시간 예상

```
D+0 오전:   프로젝트 초기화              ~2시간
D+0 오후-1: 코드 품질 설정              ~1시간
D+0 오후-2: 하네스 + 규칙               ~1시간
D+0 저녁:   문서 + 첫 커밋              ~1시간
                                    ────────
                           D+0 합계: ~5시간

D+1 오전:   DB 구축                    ~2~3시간
D+1 오후:   프론트엔드 기반 코드         ~2~3시간
D+1 저녁:   GitHub 설정 + 마무리        ~1~2시간
                                    ────────
                           D+1 합계: ~5~8시간

                           총합: ~10~13시간
```

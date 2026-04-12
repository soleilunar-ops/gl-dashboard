# 22~28단계 파일 참조 문서 (검증용)

> Cursor/Claude Code에서 작업한 결과를 이 문서와 대조하여 검증
> 작성일: 2026.04.13
> 기준: pm-full-checklist, gl-final-structure-v5, db-schema.md

---

## 22단계: Supabase 클라이언트 파일 (5개)

### 파일 1: src/lib/supabase/client.ts

```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**검증 포인트:**

- `@supabase/ssr` 사용 (supabase-js 직접 아님)
- `Database` 제네릭 타입 적용
- 환경변수 `NEXT_PUBLIC_` 접두어 확인

---

### 파일 2: src/lib/supabase/server.ts

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출 시 무시
          }
        },
      },
    }
  );
}
```

**검증 포인트:**

- `cookies()` 를 `await`로 호출 (Next.js 15)
- `getAll` / `setAll` 패턴 (구버전의 `get`/`set`/`remove` 아님)
- `try-catch`로 Server Component에서의 에러 처리

---

### 파일 3: src/lib/supabase/middleware.ts

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 비로그인 시 로그인 페이지로 리다이렉트
  if (!user && !request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

**검증 포인트:**

- `getUser()` 사용 (`getSession()` 아님 — 보안상 getUser가 권장)
- `/auth` 경로는 리다이렉트 제외
- 쿠키 갱신 로직 포함

---

### 파일 4: src/lib/supabase/types.ts

```typescript
// Supabase CLI 자동생성 타입을 re-export
// 팀원은 이 경로에서 import: import type { Database } from '@/lib/supabase/types'
// 30단계에서 auto-types.yml 설정 후 자동 갱신

export type { Database } from "../../../supabase/types";

// 자주 쓰는 타입 단축
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
```

**검증 포인트:**

- `supabase/types.ts`를 re-export
- `Tables<'products'>` 단축 타입 제공
- 팀원 import 경로: `@/lib/supabase/types`

---

### 파일 5: src/middleware.ts (src/ 루트!)

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api, _next, 정적파일 제외
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**검증 포인트:**

- 위치가 `src/middleware.ts` (app/ 안이 아님!)
- matcher에서 정적 파일 제외
- `updateSession` import 경로

---

## 23단계: 공용 유틸 (4개)

### 파일 6: src/lib/utils.ts

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// shadcn/ui 필수 — 이미 생성돼 있을 수 있음
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 날짜 포맷
export function formatDate(date: string | Date, pattern = "yyyy-MM-dd") {
  return format(new Date(date), pattern, { locale: ko });
}

// 숫자 포맷 (천 단위 콤마)
export function formatNumber(num: number) {
  return new Intl.NumberFormat("ko-KR").format(num);
}

// 원화 포맷
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(amount);
}
```

---

### 파일 7: src/lib/constants.ts

```typescript
export const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

// 재고 상태
export const STOCK_STATUS = {
  NORMAL: "정상",
  STOCKOUT: "품절",
  NEGATIVE: "⚠️마이너스",
} as const;

// 입출고 유형
export const MOVEMENT_TYPES = {
  INBOUND: "입고",
  OUTBOUND: "출고",
  ADJUSTMENT: "재고조정",
} as const;

// 품목 카테고리
export const CATEGORIES = [
  "파스형",
  "160g",
  "150g",
  "100g",
  "80g",
  "30g",
  "발난로",
  "아이워머",
  "아랫배",
  "기능성",
  "냉온찜질팩",
  "쿨링",
  "제습제",
  "기타",
  "의료기기",
] as const;

// 쿠팡 매핑 정확도
export const MAPPING_ACCURACY = {
  HIGH: "★★★",
  MEDIUM: "★★☆",
  LOW: "★☆☆",
} as const;
```

---

### 파일 8: src/lib/hooks/useAuth.ts

```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, loading, signOut };
}
```

---

### 파일 9: src/types/shared.ts

```typescript
import type { ReactNode } from "react";

// DataTable
export interface Column<T> {
  key: keyof T;
  label: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
}

// StatCard
export interface StatCardProps {
  title: string;
  value: string | number;
  change?: number; // 전월 대비 변화율(%)
  icon?: ReactNode;
}

// ChartContainer
export interface ChartContainerProps {
  title: string;
  children: ReactNode;
  loading?: boolean;
  className?: string;
}

// 공통
export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
}

export interface EmptyStateProps {
  message?: string;
  icon?: ReactNode;
}
```

---

## 24단계: 레이아웃 (9개)

### 파일 10: src/components/layout/navigation.config.ts

```typescript
import { navOrders } from "./nav-orders";
import { navForecast } from "./nav-forecast";
import { navReviews } from "./nav-reviews";
import { navLogistics } from "./nav-logistics";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: string; // lucide-react 아이콘 이름
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  { title: "주문", items: navOrders },
  { title: "분석", items: [...navForecast, ...navReviews] },
  { title: "물류", items: navLogistics },
];
```

### 파일 11~14: nav 파일들

```typescript
// nav-orders.ts
export const navOrders = [{ label: "주문 관리", path: "/orders", icon: "ShoppingCart" }];

// nav-forecast.ts
export const navForecast = [
  { label: "수요 예측", path: "/analytics/forecast", icon: "TrendingUp" },
];

// nav-reviews.ts
export const navReviews = [
  { label: "리뷰 분석", path: "/analytics/reviews", icon: "MessageSquare" },
  { label: "원가 분석", path: "/analytics/cost", icon: "Calculator" },
];

// nav-logistics.ts
export const navLogistics = [{ label: "재고 관리", path: "/logistics", icon: "Package" }];
```

### 파일 15: src/components/layout/Sidebar.tsx

**검증 포인트:**

- `navigation.config.ts`에서 메뉴 가져옴
- `lucide-react` 아이콘 동적 렌더링
- 현재 경로 활성 표시 (`usePathname()`)
- 로그아웃 버튼 포함

### 파일 16: src/components/layout/Header.tsx

**검증 포인트:**

- 사용자 이름 표시 (`useAuth()` 사용)
- 알림 아이콘 (나중에 alerts 테이블 연동)

### 파일 17: src/components/layout/PageWrapper.tsx

**검증 포인트:**

- `title` prop 받아서 페이지 제목 표시
- `children` 감싸기

### 파일 18: src/app/layout.tsx

**검증 포인트:**

- Sidebar + Header + children 조합
- `globals.css` import
- 한국어 `lang="ko"` 설정

---

## 25단계: 인증 페이지 (2개)

### 파일 19: src/app/auth/login/page.tsx

**검증 포인트:**

- 아이디 입력 (이메일 아님!) → 코드에서 `@gl-local` 자동 붙임
- `supabase.auth.signInWithPassword()` 호출
- 성공 시 `/` 로 리다이렉트
- 에러 메시지 한국어

```typescript
// 핵심 로직
const handleLogin = async () => {
  const { error } = await supabase.auth.signInWithPassword({
    email: `${username}@gl-local`, // ← @gl-local 자동 붙임
    password,
  });
  if (error) setError("아이디 또는 비밀번호가 올바르지 않습니다.");
  else router.push("/");
};
```

### 파일 20: src/app/auth/callback/route.ts

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(origin);
}
```

---

## 26단계: 메인 대시보드 (1개)

### 파일 21: src/app/page.tsx

**검증 포인트:**

- 임시 환영 카드 또는 "대시보드 메인 — 팀원 컴포넌트 완성 후 배치 예정"
- 간단한 재고 현황 숫자 표시 (v_inventory_dashboard 뷰 사용하면 좋음)

---

## 27단계: \_hooks/ 스켈레톤 (6개)

모든 파일 공통 패턴:

```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useXxx() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("테이블명")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setData(data);
      setLoading(false);
    };

    fetchData();
  }, []);

  return { data, loading };
}
```

| 파일                                   | 테이블                                            |
| -------------------------------------- | ------------------------------------------------- |
| orders/\_hooks/useOrders.ts            | stock_movements (movement_type='출고')            |
| forecast/\_hooks/useForecast.ts        | coupang_performance + fetch(FASTAPI_URL)          |
| reviews/\_hooks/useReviews.ts          | coupang_performance (review_count, avg_rating)    |
| cost/\_hooks/useCost.ts                | products (unit_cost) + coupang_performance (cogs) |
| logistics/\_hooks/useInventory.ts      | inventory (v_inventory_dashboard 뷰)              |
| logistics/\_hooks/useStockMovements.ts | stock_movements                                   |

---

## 28단계: shared/ 컴포넌트 스켈레톤 (10개)

### 핵심 5개 (최소 구현)

| 파일               | props                    | 핵심                          |
| ------------------ | ------------------------ | ----------------------------- |
| DataTable.tsx      | data, columns            | `<table>` + 매핑 렌더링       |
| ChartContainer.tsx | title, children, loading | 제목 + 로딩 스피너 + children |
| StatCard.tsx       | title, value, change     | 카드 UI + 변화율 색상         |
| LoadingSpinner.tsx | size?                    | 스피너 애니메이션             |
| EmptyState.tsx     | message?                 | "데이터가 없습니다"           |

### 나머지 5개 (빈 파일 + TODO)

```typescript
// DateRangePicker.tsx, SearchBar.tsx, ExportDropdown.tsx,
// ErrorBoundary.tsx, ConfirmDialog.tsx
// TODO: 기능 구현 시 작성
export default function ComponentName() {
  return <div>TODO</div>;
}
```

---

## 검증 체크리스트

Cursor 작업 완료 후 아래 확인:

```
□ npm run dev → localhost:3000 에러 없이 실행
□ /auth/login 페이지 표시
□ 사이드바 메뉴 5개 표시 (주문/수요예측/리뷰/원가/재고)
□ src/lib/supabase/ 에 4개 파일 존재
□ src/middleware.ts 존재 (src/ 루트)
□ src/components/shared/ 에 10개 파일 존재
□ src/components/layout/ 에 Sidebar, Header, PageWrapper + nav 4개 존재
□ _hooks/ 폴더에 6개 스켈레톤 존재
□ 콘솔에 TypeScript 에러 없음 (npx tsc --noEmit)
```

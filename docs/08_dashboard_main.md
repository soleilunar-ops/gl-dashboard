# 08. 대시보드 · 브리핑 · 데모 데이터 · 반응형

> 사이드바 **"대시보드"** 메뉴의 메인 페이지. 이 문서는 브리핑 카드 + 주간 리포트 카드를 포함한 전체 대시보드 레이아웃을 신규 설계한다.
>
> - 하루루 에이전트(00~05 문서): 건드리지 않음. 이미 운영 중(v8).
> - 기존 랜딩 페이지: 건드리지 않음. 별도 AI 에이전트 페이지.
> - 슬아의 HTML 목업: **디자인 시안**으로만 참조. 실제 React 코드는 없으므로 처음부터 구현.

---

## 1. 설계 원칙

| 원칙          | 내용                                                           |
| ------------- | -------------------------------------------------------------- |
| 스택          | Next.js 15 App Router + React 19 + TypeScript                  |
| 상태 관리     | **React Context + useReducer** (Zustand 금지)                  |
| 서버 상태     | TanStack Query                                                 |
| DB            | Supabase (FastAPI 없음)                                        |
| 라우트        | `/dashboard` (기존 랜딩 `/`와 분리)                            |
| 색상 테마     | Off-white 배경(`#F7F5F0`) + **주황 CTA(`#F97316`)**            |
| 폰트          | Pretendard Variable (본문) + JetBrains Mono (수치)             |
| 톤            | 브리핑 카드는 하루루 톤 유지. 주간 리포트만 공식 톤            |
| 반응형        | Tailwind 표준 (sm 640 / md 768 / lg 1024)                      |
| 데모 데이터   | 프로파일 상수에 품목명·수치 모두 포함 (Phase 1은 DB 조회 없음) |
| 고정 시나리오 | 대시보드는 항상 "핫팩 피크 (12/3)" 장면 — Phase 1              |

---

## 2. 파일 구조 (전부 신규)

```
src/
├── app/
│   ├── dashboard/
│   │   ├── layout.tsx                      # 사이드바 + Provider 래핑
│   │   ├── page.tsx                        # DashboardMain 호출
│   │   └── dashboard.css
│   └── (기존 랜딩 등) — 건드리지 않음
│
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx                     # 사이드바 (대시보드 최상단, active 주황)
│   │
│   ├── dashboard/
│   │   ├── DashboardMain.tsx               # 브리핑 → 브릿지 → 주간리포트
│   │   ├── DashboardTopbar.tsx             # "오늘의 하루루 브리핑" 상단 바
│   │   └── NarrativeBridge.tsx
│   │
│   ├── briefing/                           # 슬아 디자인 재구현
│   │   ├── BriefingCard.tsx                # 카드 쉘 (헤더 + 3열 + CTA)
│   │   ├── BriefingHeader.tsx              # 시즌 배지 + 날짜 + 메타
│   │   ├── BriefingWeatherColumn.tsx       # 1열
│   │   ├── BriefingInventoryColumn.tsx     # 2열
│   │   ├── BriefingActionColumn.tsx        # 3열
│   │   └── briefing.css                    # hb-* 프리픽스 (슬아 토큰 계승, CTA만 주황)
│   │
│   ├── weekly-brief/                       # 07 문서 참조
│   ├── audio/                              # 07 문서 참조 (Context 기반)
│   └── voice/                              # 07 문서 참조
│
└── lib/
    ├── demo/
    │   ├── types.ts
    │   ├── seasonProfiles.ts               # 5개 프로파일 상수
    │   ├── demoContext.tsx                 # DemoDataProvider + useDemoData
    │   └── index.ts
    │
    └── supabase/
        └── client.ts
```

---

## 3. 대시보드 레이아웃

### 3-1. `app/dashboard/layout.tsx`

```tsx
// src/app/dashboard/layout.tsx
import { Sidebar } from "@/components/layout/Sidebar";
import { AudioPlayerProvider } from "@/components/audio/AudioPlayerContext";
import { DemoDataProvider } from "@/lib/demo";
import { AudioMiniPlayer } from "@/components/audio/AudioMiniPlayer";
import "./dashboard.css";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoDataProvider>
      <AudioPlayerProvider>
        <div className="dashboard-shell">
          <Sidebar />
          <div className="dashboard-content">{children}</div>
          <AudioMiniPlayer />
        </div>
      </AudioPlayerProvider>
    </DemoDataProvider>
  );
}
```

### 3-2. `app/dashboard/page.tsx`

```tsx
// src/app/dashboard/page.tsx
import { DashboardMain } from "@/components/dashboard/DashboardMain";

export default function DashboardPage() {
  return <DashboardMain />;
}
```

### 3-3. `DashboardMain.tsx`

```tsx
// src/components/dashboard/DashboardMain.tsx
"use client";
import { DashboardTopbar } from "./DashboardTopbar";
import { BriefingCard } from "@/components/briefing/BriefingCard";
import { NarrativeBridge } from "./NarrativeBridge";
import { WeeklyBriefCard } from "@/components/weekly-brief/WeeklyBriefCard";

export function DashboardMain() {
  return (
    <main className="dashboard-main">
      <DashboardTopbar />

      <section className="dashboard-section">
        <BriefingCard />
      </section>

      <NarrativeBridge />

      <section className="dashboard-section">
        <WeeklyBriefCard />
      </section>
    </main>
  );
}
```

### 3-4. `DashboardTopbar.tsx`

```tsx
// src/components/dashboard/DashboardTopbar.tsx
"use client";
import { useState } from "react";

export function DashboardTopbar() {
  const [now] = useState(() => new Date());
  const hhmm = now.toTimeString().slice(0, 5);
  return (
    <header className="dashboard-topbar">
      <div className="dashboard-topbar-left">
        <span className="dashboard-fire" aria-hidden>
          🔥
        </span>
        <div>
          <h1 className="dashboard-title">오늘의 하루루 브리핑</h1>
          <p className="dashboard-subtitle">매일 아침 6시 · 쿠팡 50억+ 시즌 전용 대시보드</p>
        </div>
      </div>
      <div className="dashboard-topbar-actions">
        <button className="dashboard-topbar-btn">↻ 새로고침 · {hhmm}</button>
        <button className="dashboard-topbar-btn">⚙ 설정</button>
      </div>
    </header>
  );
}
```

### 3-5. `NarrativeBridge.tsx`

```tsx
// src/components/dashboard/NarrativeBridge.tsx
"use client";
import { useDemoData } from "@/lib/demo";

export function NarrativeBridge() {
  const { profile } = useDemoData();
  const text =
    profile.id === "peak"
      ? "오늘의 브리핑은 여기까지입니다. 이번 주 전체 흐름도 정리해 드릴까요?"
      : "이번 주 주간 리포트를 생성하시거나 지난 리포트를 확인하실 수 있습니다.";
  return (
    <div className="narrative-bridge" role="presentation">
      <div className="narrative-bridge-inner">{text}</div>
    </div>
  );
}
```

### 3-6. `dashboard.css`

```css
/* src/app/dashboard/dashboard.css */
.dashboard-shell {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
  background: #f7f5f0;
}
.dashboard-content {
  overflow-y: auto;
  min-width: 0;
}
.dashboard-main {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.dashboard-topbar {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  padding: 32px 32px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.dashboard-topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dashboard-fire {
  font-size: 28px;
  filter: drop-shadow(0 2px 4px rgba(249, 115, 22, 0.3));
}
.dashboard-title {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
}
.dashboard-subtitle {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}
.dashboard-topbar-actions {
  display: flex;
  gap: 8px;
}
.dashboard-topbar-btn {
  font-size: 12px;
  color: #64748b;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.dashboard-topbar-btn:hover {
  color: #0f172a;
  background: #ffffff;
}

.dashboard-section {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  padding: 0 32px 24px;
}

.narrative-bridge {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  padding: 4px 32px 20px;
}
.narrative-bridge-inner {
  border-left: 3px solid #e5e7eb;
  padding: 6px 14px;
  color: #64748b;
  font-size: 13.5px;
  font-style: italic;
  line-height: 1.5;
}

/* ─── 반응형 ─── */
@media (max-width: 1023px) {
  .dashboard-shell {
    grid-template-columns: 220px 1fr;
  }
  .dashboard-topbar,
  .dashboard-section,
  .narrative-bridge {
    padding-left: 24px;
    padding-right: 24px;
  }
  .dashboard-topbar {
    padding-top: 24px;
    padding-bottom: 16px;
  }
}

@media (max-width: 767px) {
  .dashboard-shell {
    grid-template-columns: 1fr;
  }
  .dashboard-topbar {
    flex-direction: column;
    align-items: flex-start;
    padding: 20px 16px 12px;
    gap: 12px;
  }
  .dashboard-topbar-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .dashboard-topbar-btn {
    min-height: 40px;
  }
  .dashboard-section {
    padding: 0 16px 20px;
  }
  .narrative-bridge {
    padding: 0 16px 16px;
  }
}
```

---

## 4. 사이드바

### 4-1. 메뉴 구조

```
[그룹 없음] 대시보드                 ← 🆕 최상단 · 기본 active · 주황 톤
─────────────
주문
  └ 주문 관리
─────────────
분석
  ├ 마진 산출
  └ 핫팩 시즌
─────────────
물류
  ├ 총재고 현황
  ├ 수입 리드타임
  ├ 쿠팡 밀크런 관리
  └ 재작업일 날씨
```

### 4-2. `Sidebar.tsx`

```tsx
// src/components/layout/Sidebar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Calculator,
  Snowflake,
  Package,
  Ship,
  Truck,
  CloudSun,
} from "lucide-react";

const NAV = [
  {
    group: null,
    items: [{ label: "대시보드", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    group: "주문",
    items: [{ label: "주문 관리", href: "/orders", icon: ShoppingCart }],
  },
  {
    group: "분석",
    items: [
      { label: "마진 산출", href: "/analysis/margin", icon: Calculator },
      { label: "핫팩 시즌", href: "/analysis/hotpack", icon: Snowflake },
    ],
  },
  {
    group: "물류",
    items: [
      { label: "총재고 현황", href: "/logistics/inventory", icon: Package },
      { label: "수입 리드타임", href: "/logistics/leadtime", icon: Ship },
      { label: "쿠팡 밀크런 관리", href: "/logistics/milkrun", icon: Truck },
      { label: "재작업일 날씨", href: "/logistics/weather", icon: CloudSun },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">GL</div>
        <div>
          <div className="sidebar-brand-name">GL-RADS</div>
          <div className="sidebar-brand-sub">하루온 운영 허브</div>
        </div>
      </div>

      {NAV.map((group, gi) => (
        <div key={gi} className="sidebar-group">
          {group.group && <div className="sidebar-group-label">{group.group}</div>}
          {group.items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="sidebar-icon" size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {gi < NAV.length - 1 && <div className="sidebar-divider" />}
        </div>
      ))}
    </aside>
  );
}
```

### 4-3. 사이드바 스타일 (active = 주황)

```css
.sidebar {
  background: #ffffff;
  border-right: 1px solid #e8eaec;
  padding: 28px 16px 24px;
  display: flex;
  flex-direction: column;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 20px;
  margin-bottom: 12px;
  border-bottom: 1px solid #f1f3f5;
}
.sidebar-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #0f172a, #334155);
  color: white;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sidebar-brand-name {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}
.sidebar-brand-sub {
  font-size: 10.5px;
  color: #94a3b8;
  margin-top: 1px;
  letter-spacing: 0.02em;
}

.sidebar-group {
  padding: 8px 0;
}
.sidebar-group-label {
  font-size: 10.5px;
  font-weight: 600;
  color: #94a3b8;
  padding: 0 10px 6px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  margin-bottom: 2px;
  text-decoration: none;
  transition: all 0.12s;
}
.sidebar-item:hover {
  background: #f8fafc;
  color: #0f172a;
}

/* ★ active = 주황 소프트 배경 + 주황 진한 글자 */
.sidebar-item.is-active {
  background: #fff7ed;
  color: #c2410c;
  font-weight: 600;
}
.sidebar-item.is-active .sidebar-icon {
  color: #f97316;
}

.sidebar-divider {
  height: 1px;
  background: #f1f3f5;
  margin: 8px 0;
}

@media (max-width: 767px) {
  .sidebar {
    display: none;
  }
}
```

---

## 5. 시즌 프로파일 (데모 엔진)

### 5-1. 타입

```typescript
// src/lib/demo/types.ts
export type SeasonProfileId = "pre_season" | "first_freeze" | "peak" | "late_season" | "off_season";

export interface SeasonProfile {
  id: SeasonProfileId;
  label: string;
  activeMonths: number[];

  header: {
    dateISO: string;
    dayLabel: string;
    seasonLabel: string;
    metaLine: string;
  };

  weather: {
    tempC: number;
    feelsLikeC: number;
    description: string;
    location: string;
    latitude: number;
    precipitation: Array<{ hour: number; percent: number }>;
    triggers: {
      tempDiffFromYesterday: number;
      firstSubzeroDate: string | null;
      daysEarlierThanLastYear: number;
    };
    insight: { headline: string; sub: string };
  };

  inventory: {
    top3: Array<{
      name: string;
      spec: string;
      glStock: number;
      coupangStock: number;
      glPercent: number;
      coupangPercent: number;
      status: "여유" | "적정" | "부족";
      approximate: boolean;
    }>;
    inTransit: {
      contractNumber: string;
      from: string;
      departureDate: string;
      pajuEta: string;
      quantity: number;
      currentStep: 1 | 2 | 3;
    } | null;
    arrivingToday: {
      blNumber: string;
      totalQuantity: number;
      items: Array<{ name: string; quantity: number }>;
    } | null;
    insight: { headline: string; sub: string };
  };

  action: {
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      tag: "긴급" | "오늘" | "이번주";
    }>;
    searchVolume: {
      dailyChangePercent: number;
      sparkline: number[];
      startDate: string;
      endDate: string;
    };
    insight: { headline: string; sub: string };
  };
}
```

### 5-2. `peak` 프로파일 (전체값)

```typescript
// src/lib/demo/seasonProfiles.ts
import type { SeasonProfile, SeasonProfileId } from "./types";

export const MAIN_DASHBOARD_PROFILE_ID: SeasonProfileId = "peak";

export const SEASON_PROFILES: Record<SeasonProfileId, SeasonProfile> = {
  peak: {
    id: "peak",
    label: "시즌 피크",
    activeMonths: [12, 1],

    header: {
      dateISO: "2025-12-03",
      dayLabel: "2025년 12월 3일 수요일",
      seasonLabel: "핫팩 시즌",
      metaLine: "D+95 · 쿠팡 시즌 피크 구간",
    },

    weather: {
      tempC: -8,
      feelsLikeC: -14,
      description: "맑음, 찬 바람",
      location: "파주",
      latitude: 37.76,
      precipitation: [
        { hour: 6, percent: 5 },
        { hour: 9, percent: 10 },
        { hour: 12, percent: 10 },
        { hour: 15, percent: 15 },
        { hour: 18, percent: 10 },
        { hour: 21, percent: 5 },
      ],
      triggers: {
        tempDiffFromYesterday: -3.4,
        firstSubzeroDate: "2025-11-18",
        daysEarlierThanLastYear: -7,
      },
      insight: {
        headline: "한파 피크 구간입니다.",
        sub: "수요 최대 · 야외 재포장 작업 가능",
      },
    },

    inventory: {
      top3: [
        {
          name: "붙이는 불가마",
          spec: "50g",
          glStock: 4_200,
          coupangStock: 630,
          glPercent: 52,
          coupangPercent: 15,
          status: "부족",
          approximate: true,
        },
        {
          name: "박일병 핫팩",
          spec: "150g",
          glStock: 8_940,
          coupangStock: 1_420,
          glPercent: 78,
          coupangPercent: 38,
          status: "적정",
          approximate: false,
        },
        {
          name: "군인 핫팩",
          spec: "160g",
          glStock: 2_820,
          coupangStock: 180,
          glPercent: 45,
          coupangPercent: 7,
          status: "부족",
          approximate: false,
        },
      ],
      inTransit: {
        contractNumber: "PO-2025-1108",
        from: "상해",
        departureDate: "2025-11-08",
        pajuEta: "2025-12-03",
        quantity: 25_000,
        currentStep: 1,
      },
      arrivingToday: {
        blNumber: "SGSH25120345",
        totalQuantity: 50_000,
        items: [
          { name: "붙이는 불가마 50g", quantity: 20_000 },
          { name: "박일병 핫팩 150g", quantity: 18_000 },
          { name: "군인 핫팩 160g", quantity: 12_000 },
        ],
      },
      insight: {
        headline: "군인 핫팩 160g 쿠팡 재고 180개 잔여.",
        sub: "3일 내 품절 예상 · 자사 2,820개로 밀크런 즉시 처리 권장",
      },
    },

    action: {
      tasks: [
        {
          id: "t1",
          title: "쿠팡 군인 핫팩 발주 처리",
          description: "리드타임 2주 · 권장 수량 5,000개",
          tag: "긴급",
        },
        {
          id: "t2",
          title: "파주 도착 물류 재포장 작업",
          description: "오전 중 · 50,000개 완료",
          tag: "오늘",
        },
        {
          id: "t3",
          title: "생산외주 추가 주문",
          description: "12월 쿠팡 발주 대비 · 원부자재 기확보",
          tag: "이번주",
        },
      ],
      searchVolume: {
        dailyChangePercent: 28,
        sparkline: [72, 78, 85, 88, 91, 93, 94],
        startDate: "2025-11-27",
        endDate: "2025-12-03",
      },
      insight: {
        headline: "검색량 최고치 구간.",
        sub: "과거 피크 구간 평균 판매량 +180% 기록 · 재고 충당이 핵심",
      },
    },
  },

  pre_season: {
    id: "pre_season",
    label: "시즌 준비",
    activeMonths: [9, 10],
    header: {
      dateISO: "2025-10-15",
      dayLabel: "2025년 10월 15일 수요일",
      seasonLabel: "시즌 준비",
      metaLine: "D-45 · 시즌 진입 전",
    },
    /* 나머지 필드는 peak 구조를 복사해 값만 pre_season 기준으로 조정 */
  } as SeasonProfile,

  first_freeze: {
    id: "first_freeze",
    label: "첫 영하",
    activeMonths: [11],
    header: {
      dateISO: "2025-11-18",
      dayLabel: "2025년 11월 18일 화요일",
      seasonLabel: "핫팩 시즌",
      metaLine: "D+49 · 시즌 첫 영하 돌파",
    },
    /* 값만 조정 */
  } as SeasonProfile,

  late_season: {
    id: "late_season",
    label: "시즌 후반",
    activeMonths: [2],
    header: {
      dateISO: "2026-02-10",
      dayLabel: "2026년 2월 10일 화요일",
      seasonLabel: "핫팩 시즌",
      metaLine: "D+163 · 수요 둔화 구간",
    },
    /* 값만 조정 */
  } as SeasonProfile,

  off_season: {
    id: "off_season",
    label: "비시즌",
    activeMonths: [3, 4, 5, 6, 7, 8],
    header: {
      dateISO: "2026-04-22",
      dayLabel: "2026년 4월 22일 수요일",
      seasonLabel: "비시즌",
      metaLine: "비시즌 · 쿨링타올/의료용품 중심",
    },
    /* 값만 조정 */
  } as SeasonProfile,
};
```

> **Phase 1 작업 범위**: `peak` 프로파일만 완전히 채우면 됨. 나머지 4개는 Phase 2에서 값 채움.

### 5-3. Demo Context

```tsx
// src/lib/demo/demoContext.tsx
"use client";
import { createContext, useContext, type ReactNode } from "react";
import { SEASON_PROFILES, MAIN_DASHBOARD_PROFILE_ID } from "./seasonProfiles";
import type { SeasonProfile } from "./types";

interface DemoValue {
  profile: SeasonProfile;
  isDemo: true;
}

const Ctx = createContext<DemoValue | null>(null);

export function DemoDataProvider({ children }: { children: ReactNode }) {
  const profile = SEASON_PROFILES[MAIN_DASHBOARD_PROFILE_ID];
  return <Ctx.Provider value={{ profile, isDemo: true }}>{children}</Ctx.Provider>;
}

export function useDemoData(): DemoValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemoData must be used within DemoDataProvider");
  return v;
}
```

### 5-4. `index.ts`

```typescript
// src/lib/demo/index.ts
export { DemoDataProvider, useDemoData } from "./demoContext";
export { SEASON_PROFILES, MAIN_DASHBOARD_PROFILE_ID } from "./seasonProfiles";
export type { SeasonProfile, SeasonProfileId } from "./types";
```

---

## 6. 브리핑 카드 (슬아 디자인 재구현)

### 6-1. `BriefingCard.tsx`

```tsx
// src/components/briefing/BriefingCard.tsx
"use client";
import { useDemoData } from "@/lib/demo";
import { BriefingHeader } from "./BriefingHeader";
import { BriefingWeatherColumn } from "./BriefingWeatherColumn";
import { BriefingInventoryColumn } from "./BriefingInventoryColumn";
import { BriefingActionColumn } from "./BriefingActionColumn";
import "./briefing.css";

export function BriefingCard() {
  const { profile } = useDemoData();
  return (
    <article className="hb-card">
      <BriefingHeader header={profile.header} />
      <div className="hb-body-3col">
        <BriefingWeatherColumn data={profile.weather} />
        <BriefingInventoryColumn data={profile.inventory} />
        <BriefingActionColumn data={profile.action} />
      </div>
      <div className="hb-cta-wrap">
        <button className="hb-cta-button">
          상세 보기 및 발주 관리
          <svg
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </article>
  );
}
```

### 6-2. 3개 Column 컴포넌트

슬아 목업 구조를 그대로 재현. 각 컬럼은 프로파일의 해당 섹션만 props로 받는 **presentation 컴포넌트**.

- **`BriefingWeatherColumn`** · 1열
  - 기온 48px 숫자 + 날씨 아이콘
  - 시간대별 강수확률 6칸 바 차트
  - 시즌 트리거 3행 (전일 대비 기온차 · 첫 영하 · 전년 대비 조기)
  - 파란 Insight 박스

- **`BriefingInventoryColumn`** · 2열
  - Top3 게이지: 상품명 + 규격 + 상태 pill + 지엘/쿠팡 2행 게이지
  - 물류 플로우: "진행 중 BL" 스테퍼(상해→인천→파주) + "오늘 도착 BL" 스테퍼
  - 주황 Insight 박스

- **`BriefingActionColumn`** · 3열
  - 체크리스트 3건 (긴급/오늘/이번주 태그)
  - 네이버 검색량 큰 숫자 + 막대 스파크라인
  - 초록 Insight 박스

상세 마크업·SVG는 슬아의 HTML 목업(`haruru-briefing.html`) 해당 section을 참고해 React 컴포넌트화. 색 토큰·클래스 구조는 그대로 유지.

### 6-3. `BriefingHeader.tsx`

```tsx
// src/components/briefing/BriefingHeader.tsx
interface Props {
  header: {
    dateISO: string;
    dayLabel: string;
    seasonLabel: string;
    metaLine: string;
  };
}
export function BriefingHeader({ header }: Props) {
  return (
    <div className="hb-card-header">
      <div className="hb-season-badge">
        <span aria-hidden>🔥</span>
        <span>{header.seasonLabel}</span>
      </div>
      <h2 className="hb-date-line">
        <time dateTime={header.dateISO}>{header.dayLabel}</time>
      </h2>
      <p className="hb-meta-line">{header.metaLine}</p>
    </div>
  );
}
```

### 6-4. `briefing.css` — 슬아 토큰 계승 + CTA 주황

```css
/* src/components/briefing/briefing.css */

.hb-card {
  --hb-slate-900: #0f172a;
  --hb-slate-800: #1e293b;
  --hb-slate-600: #475569;
  --hb-slate-500: #64748b;
  --hb-slate-400: #94a3b8;
  --hb-slate-300: #cbd5e1;
  --hb-slate-100: #f1f5f9;
  --hb-slate-50: #f8fafc;
  --hb-line: #e8eaec;
  --hb-line-soft: #f1f3f5;
  --hb-orange: #f97316;
  --hb-orange-soft: #fff1e6;
  --hb-orange-700: #c2410c;
  --hb-blue: #2563eb;
  --hb-blue-soft: #eaf2fe;
  --hb-blue-700: #1d4ed8;
  --hb-green: #059669;
  --hb-green-soft: #e5f6ef;
  --hb-green-50: #ecfdf5;
  --hb-green-100: #d1fae5;
  --hb-green-200: #a7f3d0;
  --hb-green-500: #10b981;
  --hb-green-600: #059669;
  --hb-green-700: #047857;
  --hb-red: #dc2626;
  --hb-red-50: #fef2f2;
  --hb-red-600: #dc2626;
  --hb-red-700: #b91c1c;
  --hb-amber-50: #fffbeb;
  --hb-amber-600: #d97706;
  --hb-amber-700: #b45309;

  background: #ffffff;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid var(--hb-line-soft);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 8px 24px -8px rgba(15, 23, 42, 0.08),
    0 20px 48px -24px rgba(15, 23, 42, 0.12);
  color: var(--hb-slate-900);
  font-feature-settings:
    "tnum" 1,
    "ss01" 1;
}
.hb-card * {
  box-sizing: border-box;
}
.hb-card svg {
  display: block;
}
.hb-card button {
  font-family: inherit;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
}

/* ─── Header ─── */
.hb-card-header {
  padding: 28px 40px 24px;
  text-align: center;
  border-bottom: 1px solid var(--hb-line-soft);
}
.hb-season-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #fb923c, var(--hb-orange));
  color: white;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 8px -2px rgba(249, 115, 22, 0.5);
  margin-bottom: 10px;
}
.hb-date-line {
  font-size: 22px;
  font-weight: 700;
  color: var(--hb-slate-900);
  letter-spacing: -0.025em;
}
.hb-meta-line {
  font-size: 11.5px;
  color: var(--hb-slate-500);
  margin-top: 6px;
  font-family: "JetBrains Mono", monospace;
}

/* ─── 3-column ─── */
.hb-body-3col {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.hb-body-3col > section {
  padding: 24px;
}
.hb-body-3col > section + section {
  border-left: 1px solid var(--hb-line-soft);
}

.hb-col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.hb-col-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--hb-slate-500);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.hb-col-meta {
  font-size: 10.5px;
  color: var(--hb-slate-400);
  font-family: "JetBrains Mono", monospace;
}

/* Weather · Inventory · Action 각 섹션의 내부 마크업 스타일은
   슬아 목업(haruru-briefing.html)을 그대로 계승. 여기서는 핵심만 */

/* ─── Insight 박스 (3색) ─── */
.hb-insight {
  border-radius: 12px;
  padding: 14px;
}
.hb-insight.hb-blue {
  background: var(--hb-blue-soft);
}
.hb-insight.hb-orange {
  background: var(--hb-orange-soft);
}
.hb-insight.hb-green {
  background: var(--hb-green-soft);
}
.hb-insight-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.hb-insight-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.hb-insight.hb-blue .hb-insight-label {
  color: var(--hb-blue);
}
.hb-insight.hb-orange .hb-insight-label {
  color: var(--hb-orange);
}
.hb-insight.hb-green .hb-insight-label {
  color: var(--hb-green);
}
.hb-insight-text {
  font-size: 12px;
  color: var(--hb-slate-800);
  line-height: 1.6;
}
.hb-insight-sub {
  font-size: 10.5px;
  color: var(--hb-slate-600);
  margin-top: 6px;
  line-height: 1.6;
}

/* ═══════════════════════════════════════════════════
   CTA — ★ 검정 → 주황으로 변경 ★
   ═══════════════════════════════════════════════════ */
.hb-cta-wrap {
  padding: 18px 36px;
  border-top: 1px solid var(--hb-line-soft);
  background: rgba(248, 250, 252, 0.4);
}
.hb-cta-button {
  width: 100%;
  background: linear-gradient(135deg, #fb923c, var(--hb-orange));
  color: white;
  font-weight: 600;
  font-size: 13.5px;
  padding: 13px 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 12px -2px rgba(249, 115, 22, 0.4);
  transition: all 0.15s;
}
.hb-cta-button:hover {
  box-shadow: 0 6px 16px -2px rgba(249, 115, 22, 0.5);
  transform: translateY(-1px);
}
.hb-cta-button svg {
  width: 16px;
  height: 16px;
  transition: transform 0.15s;
}
.hb-cta-button:hover svg {
  transform: translateX(2px);
}

/* ═══════════════════════════════════════════════════
   반응형
   ═══════════════════════════════════════════════════ */

/* 태블릿 < 1024: 3열 → 2열, 재고 컬럼 전폭 */
@media (max-width: 1023px) {
  .hb-body-3col {
    grid-template-columns: 1fr 1fr;
  }
  .hb-body-3col > section:nth-child(2) {
    grid-column: 1 / -1;
    border-left: none;
    border-top: 1px solid var(--hb-line-soft);
  }
  .hb-body-3col > section:nth-child(3) {
    border-left: 1px solid var(--hb-line-soft);
  }
  .hb-body-3col > section {
    padding: 20px;
  }
  .hb-card-header {
    padding: 24px 28px 20px;
  }
  .hb-cta-wrap {
    padding: 16px 28px;
  }
}

/* 모바일 < 640: 1열 */
@media (max-width: 639px) {
  .hb-body-3col {
    grid-template-columns: 1fr;
  }
  .hb-body-3col > section:nth-child(2),
  .hb-body-3col > section:nth-child(3) {
    grid-column: 1 / -1;
    border-left: none;
    border-top: 1px solid var(--hb-line-soft);
  }
  .hb-body-3col > section {
    padding: 20px 16px;
  }
  .hb-card-header {
    padding: 20px 18px 16px;
  }
  .hb-date-line {
    font-size: 18px;
  }
  .hb-cta-wrap {
    padding: 14px 16px;
  }
  .hb-cta-button {
    font-size: 13px;
    min-height: 48px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hb-card *,
  .hb-card *::before,
  .hb-card *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

> **구현 참고**: 슬아 목업(`haruru-briefing.html`)의 Weather/Inventory/Action 섹션 내부 마크업과 CSS (`.hb-weather-*`, `.hb-gauge-*`, `.hb-flow-*`, `.hb-tasks`, `.hb-sparkline*` 등)는 위 파일 끝에 추가로 이식.

---

## 7. 더미 데이터 전략 (Phase 1)

### 7-1. DB 조회 없음

Phase 1은 **프로파일 상수만으로 렌더**. `item_master` 실조회 없이 품목명·수치 전부 `seasonProfiles.ts`에 포함.

- 장점: 빠르고 단순, DB 부담 0
- 단점: 품목 데이터 업데이트 시 상수 수정 필요

### 7-2. Phase 2 실DB 전환 (참고)

```typescript
// 선택적 — Phase 2에서 도입 가능
export function useBriefingInventory() {
  const { profile, isDemo } = useDemoData();
  return useQuery({
    queryKey: ["briefing", "inventory", profile.id],
    queryFn: async () => {
      if (isDemo) return profile.inventory;
      // 실DB 조회...
    },
  });
}
```

---

## 8. 반응형 종합

| 화면 폭      | 사이드바   | 브리핑          | 주간리포트 섹션 칩 | 음성 플레이어         |
| ------------ | ---------- | --------------- | ------------------ | --------------------- |
| `≥ 1024px`   | 260px 고정 | 3열             | 7칩 가로           | 우하단 floating 380px |
| `768~1023px` | 220px 고정 | 2열 (재고 전폭) | 4칩/행 (2행)       | 우하단 floating       |
| `640~767px`  | 숨김       | 2열             | 2칩/행             | 하단 sticky 전폭      |
| `< 640px`    | 숨김       | 1열             | 2칩/행             | 하단 sticky 전폭      |

모바일 햄버거 드로어는 **Phase 2**에서 구현.

---

## 9. 배포 체크리스트

### 라우팅

- [ ] `/dashboard` 접근 시 `DashboardMain` 렌더
- [ ] 기존 `/` (랜딩)은 그대로 동작 (건드리지 않음)
- [ ] 사이드바 "대시보드" 기본 active

### 디자인 일치

- [ ] 슬아 목업 3열 구조 재현
- [ ] Top3 게이지 바, 상해→인천→파주 스테퍼, 검색량 스파크라인, Insight 3색 박스 모두 재현
- [ ] **CTA 검정 → 주황** (`#F97316`) 확인
- [ ] 시즌 배지·플로팅 버튼도 주황 톤

### 상태 관리

- [ ] `DemoDataProvider`가 `dashboard/layout.tsx`에 단일 존재
- [ ] `AudioPlayerProvider`가 `dashboard/layout.tsx`에 단일 존재
- [ ] Zustand 의존 0건 (grep 확인)
- [ ] Zustand 패키지가 `package.json`에 없음

### 데모 데이터

- [ ] 대시보드 접속 시 항상 `peak` 프로파일 렌더
- [ ] 리로드해도 수치 동일
- [ ] 5개 프로파일 타입 정의 완료 (값은 peak만 Phase 1)

### 반응형

- [ ] ≥1024: 3열 + 사이드바 260px
- [ ] 768~1023: 2열 (재고 전폭) + 사이드바 220px
- [ ] 640~767: 2열 + 사이드바 숨김
- [ ] <640: 1열 + 사이드바 숨김
- [ ] 터치 타겟 44~48px

### 주간 리포트 연결

- [ ] 브리핑 아래 내러티브 브릿지 한 줄
- [ ] 주간 리포트 카드 렌더
- [ ] 상단 actions: 전체보기·듣기만 (새로 생성 없음 — 07 문서)
- [ ] 하단 **큰 주황 CTA** (07 § 3-3 참조)

### 접근성

- [ ] 사이드바 active `aria-current="page"`
- [ ] `prefers-reduced-motion` 준수
- [ ] 헤더 아이콘 버튼 `aria-label`

---

## 10. Phase 2 확장

- 모바일 햄버거 메뉴 + 드로어 사이드바
- URL 쿼리 시뮬레이터 `?demo=first_freeze` 등으로 프로파일 전환 (개발자·영업용)
- 실DB 연동 (`isDemo=false` 모드)
- 나머지 4개 프로파일 값 완성 (pre_season · first_freeze · late_season · off_season)
- 다른 위젯 추가 (P&L, 환율 알림 등)
- 다크 모드

---

## 11. 변경 이력

| 버전 | 날짜       | 내용                                                                                                                                                                                                                                                                  |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1 | 2026-04-22 | 초안 — 슬아 실코드 가정                                                                                                                                                                                                                                               |
| v0.2 | 2026-04-22 | 팀원 CSS 기반 재작성                                                                                                                                                                                                                                                  |
| v0.3 | 2026-04-23 | **전면 재작성**. 슬아 실코드 없는 전제, 처음부터 신규 설계. 경로 `/dashboard`. 주황 CTA (검정 폐기). `AudioPlayerProvider`도 React Context. 프로파일 상수에 품목명·수치 모두 포함(Phase 1은 DB 조회 없음). 사이드바 "대시보드" 최상단 + active 주황 톤. 반응형 4단계. |

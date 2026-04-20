# 🎨 UI/UX 수정 가이드 — 비전문가용

> 작성자: PM (지호)
> 작성일: 2026-04-20
> 대상: 팀원 누구나 (개발 경험 적어도 이해 가능)
> 목적: 화면 디자인(색·크기·배치 등)만 수정해도 다른 기능이 깨지지 않도록 안내

---

## 들어가며 — 건물에 비유하면

우리 시스템을 **집**이라고 생각하면 이해가 쉽습니다.

| 집의 부분               | 우리 시스템에 해당        | 파일 위치                                     |
| ----------------------- | ------------------------- | --------------------------------------------- |
| 벽지·페인트·바닥재      | 화면 색상·폰트·간격       | `src/app/globals.css`                         |
| 의자·탁자·소파 (가구)   | 버튼·카드·입력창          | `src/components/ui/`                          |
| 거실·주방 배치          | 페이지 레이아웃           | `src/components/{팀원영역}/`                  |
| 집 문패·현관            | 사이드바·메뉴             | `src/components/layout/`                      |
| **전기·수도·가스 배관** | **데이터 조회·계산 로직** | `_hooks/`, `src/lib/` — 만지면 집 전체 망가짐 |

**UI/UX 수정이란** = 벽지·가구·배치만 바꾸기. 전기·수도 쪽을 건드리면 집 전체가 안 돌아갑니다.

---

## 1. 전체 색상·폰트 한 번에 바꾸기

### 파일: `src/app/globals.css`

**역할**: 사이트 전체의 색·둥근 모서리·그림자를 정의하는 "디자인 사전".

### 핵심 변수 (51~83줄 근처)

```css
:root {
  --background: oklch(1 0 0); /* 배경색 (흰색) */
  --foreground: oklch(0.145 0 0); /* 글씨색 (검정) */
  --primary: oklch(0.205 0 0); /* 주요색 (버튼·링크) */
  --primary-foreground: oklch(0.985 0 0); /* 주요색 위의 글씨 */
  --card: oklch(1 0 0); /* 카드 배경 */
  --muted: oklch(0.97 0 0); /* 흐린 배경 (비활성) */
  --destructive: oklch(0.577 0.245 27.325); /* 삭제·경고 빨강 */
  --border: oklch(0.922 0 0); /* 테두리 색 */
  --radius: 0.625rem; /* 전체 둥근 모서리 */
}
```

### 예시 1: 주요 색을 파란색으로

**Before**:

```css
--primary: oklch(0.205 0 0);
```

**After**:

```css
--primary: oklch(0.55 0.22 260); /* 파란색 */
```

🎯 **효과**: 사이트 모든 "주요 버튼", "활성 탭", "강조 링크"가 한꺼번에 파란색으로.

### 예시 2: 모서리 좀 더 둥글게

**Before**:

```css
--radius: 0.625rem; /* 10px */
```

**After**:

```css
--radius: 1rem; /* 16px */
```

🎯 **효과**: 모든 카드·버튼·다이얼로그의 모서리가 둥글어짐.

### ⚠️ 주의

- `oklch(밝기 채도 색상)` 형식 유지 (쉼표 없이 공백)
- 밝기 0 = 검정, 1 = 흰색 / 색상 각도 0~360
- `.dark { ... }` 블록(86~118줄)도 **다크모드 별도 정의** — 같이 바꿔야 다크모드도 어울림
- **`@import` 라인 절대 지우지 말 것** — shadcn 컴포넌트(Tabs/Dialog 등) 전부 깨짐

---

## 2. 버튼·카드 등 부품 모양 전체 바꾸기

### 파일: `src/components/ui/{컴포넌트}.tsx`

**역할**: 버튼 하나, 카드 하나의 기본 생김새.

### 수정 가능한 23개 부품

```
alert, badge, button, calendar, card, chart, checkbox, dialog,
dropdown-menu, input, label, pagination, popover, progress,
radio-group, select, skeleton, slider, sonner, table, tabs,
toggle, toggle-group
```

### 예시: 버튼 기본 크기 키우기

**파일**: `src/components/ui/button.tsx`

**찾을 부분**: `size` 변형 정의

**Before**:

```tsx
size: {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md gap-1.5 px-3 text-xs",
  lg: "h-10 rounded-md px-6",
  icon: "size-9",
}
```

**After**:

```tsx
size: {
  default: "h-10 px-5 py-2",
  sm: "h-8 rounded-md gap-1.5 px-3 text-xs",
  lg: "h-11 rounded-md px-7",
  icon: "size-10",
}
```

🎯 **효과**: 모든 `<Button>` 기본 크기가 커짐.

### ⚠️ 주의 — 하지 말아야 할 것

- `data-slot="..."` 같은 `data-*` 속성 제거 금지 (shadcn 내부 동작에 필요)
- `React.ComponentProps`, `ref` 같은 타입 부분 건드리지 말 것
- 함수 이름 (`Button`, `buttonVariants`) 바꾸지 말 것

---

## 3. 특정 페이지만 재배치하기

가장 흔한 UI/UX 수정 케이스. 각 팀원별 영역의 기능 컴포넌트에서.

### 영역 구분표

| 영역             | 경로                                  | 담당    |
| ---------------- | ------------------------------------- | ------- |
| 주문 관리        | `src/components/orders/`              | 슬아    |
| 원가/마진 계산기 | `src/components/analytics/cost/`      | 슬아    |
| 수요 예측        | `src/components/analytics/forecast/`  | 정민    |
| 프로모션 분석    | `src/components/analytics/promotion/` | 나경    |
| 리뷰 분석        | `src/components/analytics/reviews/`   | 나경    |
| 물류·재고        | `src/components/logistics/`           | 진희    |
| 홈 대시보드      | `src/components/dashboard/`           | PM·공용 |

### 파일 내 수정 가능한 부분

각 `.tsx` 파일 구조:

```tsx
export default function 컴포넌트이름() {
  // ... (이건 로직 — 건드리지 말 것)

  return (
    <div className="...">
      {" "}
      {/* ← 이 부분이 UI */}
      <h1 className="...">...</h1>
      <Button className="...">저장</Button>
    </div>
  );
}
```

**UI 수정 = `return (...)` 내부의 `className`과 JSX 태그만 수정**.

### 예시 1: 그리드 컬럼 수 바꾸기

**파일**: `src/components/dashboard/DashboardSummaryCards.tsx`

**Before**:

```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
```

`grid-cols-4` = "큰 화면에서 가로 4칸"

**After** (2x2 배치):

```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
```

### 예시 2: 버튼 색상 변경

```tsx
<Button variant="default">저장</Button>       {/* 기본 */}
<Button variant="destructive">삭제</Button>    {/* 빨간색 */}
<Button variant="outline">취소</Button>        {/* 테두리만 */}
<Button variant="ghost">더보기</Button>        {/* 배경 없음 */}
<Button variant="secondary">보조</Button>      {/* 회색 */}
```

### 예시 3: 텍스트 크기·굵기

**Before**:

```tsx
<h1 className="text-2xl font-bold">주문 관리</h1>
```

**After**:

```tsx
<h1 className="text-3xl font-extrabold">주문 관리</h1>  {/* 더 크고 굵게 */}
```

### 예시 4: 카드 사이 간격

```tsx
<div className="grid gap-4"> {/* 16px, 기본 */}
<div className="grid gap-2"> {/* 8px, 좁게 */}
<div className="grid gap-8"> {/* 32px, 넓게 */}
```

### Tailwind 치트시트 (자주 쓰는 것)

| 하고 싶은 것              | className                |
| ------------------------- | ------------------------ |
| 배경 회색                 | `bg-gray-100`            |
| 글씨 빨강                 | `text-red-600`           |
| 여백 (모든 방향)          | `p-4` (= 16px)           |
| 좌우 여백만               | `px-4`                   |
| 상하 여백만               | `py-4`                   |
| 큰 글씨                   | `text-2xl`               |
| 굵은 글씨                 | `font-bold`              |
| 가운데 정렬               | `text-center`            |
| 둥근 모서리               | `rounded-lg`             |
| 그림자                    | `shadow-md`              |
| 테두리                    | `border border-gray-300` |
| 가로로 정렬               | `flex gap-2`             |
| 세로로 정렬               | `flex flex-col gap-2`    |
| 2칸 그리드                | `grid grid-cols-2 gap-4` |
| 숨기기                    | `hidden`                 |
| 폰에선 숨기고 PC에서 보기 | `hidden md:block`        |

---

## 4. 사이드바 메뉴 수정

### 파일: `src/components/layout/nav-{영역}.ts`

영역 담당자가 수정. 메뉴 목록 정의.

**예시**: `nav-promotion.ts`

```ts
export const navPromotion = [
  { label: "프로모션 분석", path: "/analytics/promotion", icon: "Megaphone" },
  { label: "데이터 업로드", path: "/analytics/promotion/upload", icon: "Upload" },
];
```

### 메뉴 추가 예시

```ts
export const navPromotion = [
  { label: "프로모션 분석", path: "/analytics/promotion", icon: "Megaphone" },
  { label: "데이터 업로드", path: "/analytics/promotion/upload", icon: "Upload" },
  { label: "쿠폰 관리", path: "/analytics/promotion/coupons", icon: "Ticket" }, // 신규
];
```

### ⚠️ 주의

- `icon` 값은 [lucide.dev](https://lucide.dev) 에서 아이콘 이름 검색
- 새 아이콘 쓸 때 `src/components/layout/Sidebar.tsx` 의 `iconMap` 에도 추가해야 함

---

## 5. 페이지 추가·이동

### 파일: `src/app/(dashboard)/{경로}/page.tsx`

**역할**: URL 라우팅. **10줄 이내 규칙** — 로직 금지, 배치만.

### 올바른 예시

```tsx
// src/app/(dashboard)/orders/page.tsx
import PageWrapper from "@/components/layout/PageWrapper";
import OrderDashboard from "@/components/orders/OrderDashboard";

export default function OrdersPage() {
  return (
    <PageWrapper title="주문 관리">
      <OrderDashboard />
    </PageWrapper>
  );
}
```

### ❌ 절대 금지

```tsx
export default function OrdersPage() {
  const [data, setData] = useState([]); //  로직 금지
  useEffect(() => {
    fetch(...);
  }, []); //  로직 금지
  return <div>{/* 100줄 JSX */}</div>;
}
```

---

## 6. 실전 예시 10가지 (그대로 따라하면 됨)

### 예시 1: 홈 대시보드 환영 카드 배경을 파랗게

**파일**: `src/app/(dashboard)/page.tsx`

```tsx
// Before
<Card className="mb-6">
  <CardContent className="pt-6">
    <p className="text-lg font-medium">하루온 스마트 재고시스템...</p>

// After
<Card className="mb-6 bg-blue-50 border-blue-200">
  <CardContent className="pt-6">
    <p className="text-lg font-medium text-blue-900">하루온 스마트 재고시스템...</p>
```

### 예시 2: 사이드바 폭을 좁게 (240px → 200px)

**파일**: `src/components/layout/Sidebar.tsx`

```tsx
// Before
<aside className="bg-card flex h-full w-60 flex-col border-r">

// After
<aside className="bg-card flex h-full w-50 flex-col border-r">
```

### 예시 3: 버튼 기본 색을 초록으로

**파일**: `src/app/globals.css`

```css
/* 56~57줄 근처 */
--primary: oklch(0.55 0.18 145); /* 초록 */
--primary-foreground: oklch(0.985 0 0);
```

### 예시 4: 테이블 행 높이 좁게

**파일**: `src/components/ui/table.tsx`

```tsx
// Before
<tr className="... h-12 ...">

// After
<tr className="... h-9 ...">
```

### 예시 5: 카드 그림자 강하게

**파일**: `src/components/ui/card.tsx`

```tsx
// Before
"rounded-xl border shadow-sm";

// After
"rounded-xl border shadow-lg";
```

### 예시 6: 특정 페이지만 배경 다른 색으로

**파일**: `src/app/(dashboard)/analytics/promotion/page.tsx`

```tsx
// Before
<PageWrapper title="프로모션 분석">
  <PromotionTabs />
</PageWrapper>

// After (배경 연노랑)
<PageWrapper title="프로모션 분석">
  <div className="bg-yellow-50 p-6 rounded-lg">
    <PromotionTabs />
  </div>
</PageWrapper>
```

### 예시 7: 로딩 스피너 색상 변경

**파일**: `src/components/shared/LoadingSpinner.tsx`

```tsx
// 찾기
className = "animate-spin ... text-blue-600";

// 변경
className = "animate-spin ... text-purple-600";
```

### 예시 8: 에러 메시지 더 눈에 띄게

**파일**: `src/components/shared/EmptyState.tsx`

```tsx
// Before
<p className="text-sm text-muted-foreground">...</p>

// After
<p className="text-base text-red-600 font-medium">...</p>
```

### 예시 9: 탭 아래 밑줄 두껍게

**파일**: `src/components/ui/tabs.tsx`

```tsx
// Before
"... border-b-2 border-transparent ...";

// After
"... border-b-4 border-transparent ...";
```

### 예시 10: 다이얼로그 최대 폭 키우기

**파일**: `src/components/ui/dialog.tsx`

```tsx
// Before
"... sm:max-w-lg ..."; /* 512px */

// After
"... sm:max-w-2xl ..."; /* 672px */
```

---

## 7. 비전공자용 실수 방지 체크리스트

### 수정 전

- [ ] 파일 경로가 `src/components/ui/` 또는 feature 폴더 (`orders`·`logistics` 등) 인가?
- [ ] 수정할 부분이 **`return (...)` 내부** 또는 **CSS 변수** 인가?
- [ ] `useState`, `useEffect`, `function onSubmit`, `supabase.from` 같은 단어가 있는 **위** 부분은 건드리지 말 것

### 수정 중

- [ ] 따옴표 짝 맞추기 (`"..."`)
- [ ] `<div>` 열었으면 `</div>`로 닫기
- [ ] `className=` 안의 값은 **공백으로 구분** (쉼표 아님)
- [ ] JavaScript 변수는 `{}` 감싸기: `<div className={변수}>`
- [ ] 문자열은 따옴표: `<div className="bg-red-500">`

### 수정 후

- [ ] 파일 저장 (Ctrl+S)
- [ ] 브라우저 자동 새로고침 — 변경 즉시 보임 (HMR)
- [ ] 이상하면 **Ctrl+Z** 로 되돌리기

---

## 8. ⛔ 절대 건드리면 안 되는 것

```
src/components/**/_hooks/*.ts      ← DB 조회, 수정 금지
src/lib/**/*.ts                    ← 계산 로직, 수정 금지
src/app/api/**/route.ts            ← 서버 코드, 수정 금지
src/lib/supabase/types.ts          ← 자동생성, 수정 금지
next-env.d.ts                      ← 자동생성, 수정 금지
package.json                       ← 의존성, 수정 금지
supabase/migrations/*              ← DB 구조, 수정 금지
```

**파일명에 `_hooks`, `lib`, `api`, `types`가 들어있으면 건드리지 말 것!**

---

## 9. 만약 실수로 건드렸다면

### 저장 안 한 상태

- Ctrl+Z 로 되돌리기

### 이미 저장한 상태 — 터미널에서

```bash
git checkout -- 파일경로    # 해당 파일만 원복
git status                   # 뭐가 바뀌었는지 확인
```

---

## 10. 요약 한 장

| 바꾸고 싶은 것           | 어디서?                                           | 무엇을?                          |
| ------------------------ | ------------------------------------------------- | -------------------------------- |
| **전체 색상·폰트**       | `src/app/globals.css`                             | `--primary: oklch(...)` 등 변수  |
| **버튼·카드 공통 모양**  | `src/components/ui/{컴포넌트}.tsx`                | `className` 안의 Tailwind 클래스 |
| **사이드바·헤더**        | `src/components/layout/Sidebar.tsx`, `Header.tsx` | JSX `className`                  |
| **메뉴 추가·변경**       | `src/components/layout/nav-{영역}.ts`             | label·path·icon                  |
| **특정 페이지 레이아웃** | `src/components/{영역}/*.tsx`                     | `return (...)` 내부 JSX          |
| **페이지 이동 추가**     | `src/app/(dashboard)/{경로}/page.tsx`             | import + 배치만                  |

---

## 핵심 3원칙

1. **"변경 이유"가 "화면 모양"이면 UI 수정 가능** (로직 이유면 개발자 호출)
2. **`_hooks/`·`lib/`·`api/`·`types`·`package.json` 이 단어 보이면 닫기**
3. **수정 후 브라우저에서 최소 3페이지 확인**

---

## 실제 교훈 (2026-04-20 나경 PR 사례)

나경 PR에서 `globals.css` 의 `@import "shadcn/tailwind.css";` **한 줄을 제거**한 것이 원인이 되어:

- 쿠팡 밀크런 탭 전체 붕괴 (Tabs 컴포넌트의 활성/비활성 구분 실패)
- 프로모션 4탭 스타일 이상
- Dialog·RadioGroup 등 shadcn 스테이트풀 컴포넌트 전부 영향

→ **UI 수정이라도 `@import` 제거는 로직 영향**. 위 가이드 원칙("파일 상단 import 건드리지 않기")을 지켰다면 예방 가능했던 사고.

---

## 참고 — 자주 쓰는 Tailwind 색상 팔레트

```
bg-red-500     ← 빨강
bg-orange-500  ← 주황
bg-amber-500   ← 호박
bg-yellow-500  ← 노랑
bg-lime-500    ← 라임
bg-green-500   ← 초록
bg-emerald-500 ← 에메랄드
bg-teal-500    ← 틸
bg-cyan-500    ← 시안
bg-sky-500     ← 하늘
bg-blue-500    ← 파랑
bg-indigo-500  ← 남색
bg-violet-500  ← 제비꽃
bg-purple-500  ← 보라
bg-fuchsia-500 ← 푸시아
bg-pink-500    ← 분홍
bg-rose-500    ← 장미
bg-gray-500    ← 회색
bg-slate-500   ← 슬레이트
```

숫자는 50(가장 연함)~950(가장 진함) 범위.
예시:

- `bg-blue-50` = 아주 연한 파랑 (배경용)
- `bg-blue-500` = 중간 파랑
- `bg-blue-900` = 아주 진한 파랑 (글씨용)

글씨 색은 `text-{색}-{숫자}`:

- `text-red-600` = 중간 빨강 글씨

---

## 끝

이 가이드는 팀원 누구나 자기 영역 UI 수정할 때 참고할 용도. 궁금한 점은 PM에게 직접.

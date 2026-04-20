# 쿠팡 밀크런 관리 — 핵심 기능 요약

> 화면 경로: `물류 → 쿠팡 밀크런 관리` (`/logistics/coupang-milkrun`)  
> 메인 컴포넌트: `src/components/logistics/CoupangMilkrunPage.tsx` (**비용 계산기** · **기간별 조회** 2탭)

---

## 1. 비용 계산기

| 항목          | 설명                                                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **목적**      | 티켓팅일에 열린 센터만 골라, 센터마다 파렛트 수를 넣어 **총 비용·비중**을 본다.                                                                                                                                                        |
| **데이터**    | `src/data/milkrun-centers.json` — 센터명·BASIC 단가 (VAT 별도). 전량은 루트 엑셀로 `npm run parse:milkrun-centers` 갱신 가능.                                                                                                          |
| **주요 UX**   | 센터 검색, **필터된 목록만** 전체 선택/해제, 즐겨찾기·즐겨찾기만 보기, 배정 테이블(BASIC 오름차순), 총합 패널, **CSV**(UTF-8 BOM으로 Excel 한글 깨짐 방지).                                                                            |
| **초안 저장** | 브라우저 `localStorage` (`milkrun-allocation-draft`) — 새로고침 후에도 유지.                                                                                                                                                           |
| **저장**      | 다이얼로그에서 **출고일**·메모 입력 → 브라우저 `useMilkrunAllocations`가 Supabase `allocations` / `allocation_items`에 직접 insert (로그인·RLS). 동일 계약의 선택적 REST: `POST /api/allocations`(쿠키 세션·Supabase 서버 클라이언트). |

---

## 2. 재작업일 날씨

> 별도 메뉴: `물류 → 재작업일 날씨` (`/logistics/milkrun-weather`) — 이 문서의 밀크런 화면과 분리됨.

| 항목     | 설명                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| **목적** | **출고일**을 넣으면 재작업일 **D-2, D-1** 날씨를 본다. (UI 표기는 출고일; API 쿼리 파라미터명은 `orderDate`)              |
| **지역** | **파주 고정** (격자 `nx=56`, `ny=131`). 드롭다운 없음.                                                                    |
| **API**  | `GET /api/weather?orderDate=YYYY-MM-DD` — 서버에서 KMA 키(`KMA_SERVICE_KEY`)로만 호출.                                    |
| **분기** | 재작업일이 오늘부터 **3일 이내** → 단기예보, **그 이후(최대 10일)** → 중기(육상 + 기온). 과거/너무 먼 미래는 안내 메시지. |
| **표시** | 카드별 단기/중기 뱃지, 기온·강수·풍속 등, 경보 배지(우천·강풍·한파·폭염).                                                 |

---

## 3. 기간별 조회

| 항목     | 설명                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **목적** | 저장된 배정을 **기간으로 조회**하고, 요약·일별 막대 차트·목록·상세·삭제·CSV.                                                                                             |
| **화면** | `useMilkrunAllocations`로 Supabase에서 직접 조회·삭제·CSV.                                                                                                               |
| **API**  | (선택) `GET /api/allocations?start=&end=` — 요약·일별 집계·목록. `GET /api/allocations/:id` — 상세(라인). `DELETE /api/allocations/:id` — 삭제. **쿠키 세션 인증 필수.** |
| **DB**   | Supabase `public.allocations`, `public.allocation_items` — `supabase/migrations/20260418150000_create_milkrun_allocations.sql` 등으로 생성·RLS(`authenticated`).         |

---

## 환경 변수 (요약)

| 변수                                                         | 용도                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `KMA_SERVICE_KEY`                                            | 기상청 단기·중기 예보 (날씨)                                 |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 밀크런 저장·조회(브라우저 및 `/api/allocations` 서버 라우트) |

---

## 코드 위치 빠른 참조

| 영역          | 경로                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| 2탭 UI        | `MilkrunCalculatorTab.tsx`, `MilkrunHistoryTab.tsx`                                     |
| 날씨          | `src/app/(dashboard)/logistics/milkrun-weather/page.tsx`, `PajuWeatherDashboard.tsx` 등 |
| 날씨 API      | `src/app/api/weather/route.ts`, `src/lib/kma-*.ts`, `src/lib/paju.ts`                   |
| 배정 API      | `src/app/api/allocations/route.ts`, `src/app/api/allocations/[id]/route.ts`             |
| 클라이언트 훅 | `src/components/logistics/_hooks/useMilkrunAllocations.ts`                              |

---

## 용어

- 화면에 쓰는 **“출고일”** = 스케줄 기준일. DB/API 필드명은 여전히 `orderDate`인 경우가 많음 (호환 유지).

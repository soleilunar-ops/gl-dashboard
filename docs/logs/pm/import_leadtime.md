# 수입 리드타임 — PM 전달 요약 (Supabase `import_leadtime`)

> 작성: 2026-04-18 · 프론트(진흐 영역)에서 수입 리드타임 UI·훅·API 연동 작업 시 참고용

## 1. DB가 “새로” 생긴 것인지

- **로컬/리포에 추가된 것은 마이그레이션 파일**입니다. 원격 Supabase 프로젝트에 **아직 적용하지 않았다면** 원격 DB에는 테이블이 없습니다.
- 적용 순서(파일명 타임스탬프 기준):
  1. `20260418104500_add_import_leadtime_manual_expected.sql` — **이미 `import_leadtime` 테이블이 있을 때만** `step1_expected`, `step3_expected` 컬럼 추가(없으면 스킵).
  2. `20260418123000_create_import_leadtime_table.sql` — **`import_leadtime` 테이블이 없으면** 전체 테이블 + 인덱스 + RLS 정책 생성.
  3. `20260420120000_import_leadtime_api_grants.sql` — **PostgREST용** `authenticated` / `service_role` 테이블 권한(테이블 없으면 스킵).

**원격 Supabase에 적용 (CLI):** 리포 루트에서 `npx supabase link --project-ref <프로젝트 ref>` 후 `npx supabase db push`. 로컬만 검증할 때는 `npx supabase start` 뒤 동일하게 `db push` 또는 `db reset`(시드 비활성화됨).

**PM 액션:** 각 환경에서 위 마이그레이션이 **순서대로** 반영됐는지(Supabase 대시보드 SQL Editor의 migration 이력 또는 `db push` 로그) 확인해 주세요. `supabase/config.toml`은 CLI용으로 추가됨(`project_id = "gl-dashboard"`, 원격과 맞추려면 `link`로 연동).

## 2. 테이블 역할

| 항목     | 설명                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| 테이블명 | `public.import_leadtime`                                                                                           |
| 용도     | ERP 발주 미연동 **수입 리드타임 건** 저장: 발주번호·품목·발주일(`step1_actual`)·BL·단계별 실제/예상일·승인 여부 등 |
| UI 위치  | `/logistics/leadtime`, 물류 영역 `LeadTimeTracker`                                                                 |
| 외부 API | BL 조회: Next `/api/tracking` → 유니패스 화물통관 + 공공데이터포털 외항반출입(키는 서버 env)                       |

## 3. RLS·권한

- 정책명: `"Allow all for authenticated users"` — **`authenticated` 역할**에 대해 `FOR ALL` (기존 `order_excel_upload_logs` 등과 동일 패턴).
- **`GRANT` 마이그레이션(20260420120000):** RLS만으로는 `permission denied`가 날 수 있어 `authenticated`에 SELECT·INSERT·UPDATE·DELETE, `service_role`에 ALL을 부여합니다.
- **비로그인(anon) 클라이언트**로는 insert/delete가 막힐 수 있습니다. 앱이 로그인 후 Supabase 세션으로만 접근하는지 QA해 주세요.

## 4. 프론트 동작 요약

- **건 추가:** `insert`로 DB 저장. 선택 시 **발주일**은 `step1_actual`에 들어갈 수 있음.
- **저장:** 단계별 실제/예상일 갱신(`sea_days`/`customs_days`는 DB 기본값 2 유지).
- **삭제:** 상세 카드 하단 `삭제` 버튼 + 목록 맨 오른쪽 휴지통 아이콘 → `DELETE` 후 목록 재조회.
- **`NEXT_PUBLIC_LEADTIME_MOCK`:** `true`일 때 DB에 **행이 없으면** 시드 1건만 표시. DB에 행이 있으면 **실데이터 우선**. INSERT 실패 시에만 MOCK 폴백(로컬 추가)이 동작할 수 있음.

## 5. 환경 변수(참고)

| 변수                        | 용도                                  |
| --------------------------- | ------------------------------------- |
| `UNIPASS_API_KEY`           | BL → 유니패스 (서버, `/api/tracking`) |
| `PUBLIC_DATA_API_KEY` 등    | 외항반출입 2차 조회                   |
| `NEXT_PUBLIC_LEADTIME_MOCK` | 위 MOCK 동작 (운영에서는 보통 끔)     |

## 6. 타입·문서

- `supabase/types.ts`에 `import_leadtime`이 아직 없으면 훅은 로컬 타입 + `as never`로 테이블명만 맞춰 사용 중입니다. 스키마 반영 후 `types` 재생성하면 정리 가능합니다.

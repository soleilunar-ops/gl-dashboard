# 코딩 컨벤션

## 네이밍

- 변수명: camelCase (TypeScript), snake_case (Python)
- 컴포넌트: PascalCase (OrderListTable.tsx)
- 상수: UPPER_SNAKE_CASE
- 파일명: 컴포넌트는 PascalCase, 훅은 camelCase (useOrders.ts)

## import 순서

1. React (import { useState } from "react")
2. 외부 라이브러리 (import { format } from "date-fns")
3. @/components/shared (import { DataTable } from "@/components/shared/DataTable")
4. @/components/[본인영역] (import { OrderDetail } from "./OrderDetail")
5. @/lib (import { createBrowserClient } from "@/lib/supabase/client")

## Supabase 사용 규칙

- 단순 CRUD는 프론트엔드에서 supabase-js 직접 호출
- AI/RAG 관련만 FastAPI 경유
- UI 컴포넌트는 반드시 src/components/ui/에서 import
- 한국어 주석 사용

## 금지 라이브러리

### 절대 금지 (대체 수단이 이미 있음)

- ORM: Prisma, Drizzle, TypeORM (→ Supabase 직접 호출)
- UI: MUI, Ant Design, Chakra, Mantine (→ shadcn/ui만 사용)
- HTTP: axios (→ fetch 또는 supabase-js)
- 상태 관리: Redux (→ React useState/useContext)

### PM 승인 필요 (현재는 사용하지 않지만 나중에 도입 가능)

- 데이터 캐싱: react-query, SWR (→ 현재는 \_hooks/ 패턴)
- 경량 상태 관리: Zustand, Jotai (→ 현재는 useState/useContext)
- PM 승인 절차: 팀 채널에 사유 공유 → PM 확인 → PROJECT_RULES.md 수정 → 커밋

## 데이터 가져오기 패턴

- 컴포넌트 데이터는 같은 폴더 \_hooks/에서 가져온다
- \_hooks/에서 supabase.from().select() 사용
- FastAPI 호출은 forecast 전용 (FASTAPI_URL + '/endpoint')

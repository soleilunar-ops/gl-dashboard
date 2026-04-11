---
name: supabase-crud
description: "Supabase 테이블 조회, 삽입, 수정, 삭제, RPC 호출, 또는 타입 안전한 DB 작업을 할 때"
---

# Supabase CRUD 패턴 가이드

## 기본 조회

```typescript
const { data, error } = await supabase
  .from("products")
  .select("*")
  .order("created_at", { ascending: false });
if (error) throw error;
```

## 필터 조회

```typescript
const { data, error } = await supabase
  .from("orders")
  .select("*")
  .eq("status", "pending")
  .gte("order_date", "2026-01-01")
  .range(0, 49);
```

## 타입 안전 패턴

```typescript
import { Database } from "@/lib/supabase/types";
type Product = Database["public"]["Tables"]["products"]["Row"];
```

## 연결 조회 (JOIN)

```typescript
const { data, error } = await supabase.from("orders").select("*, products(name, sku)");
```

## 삽입

```typescript
const { data, error } = await supabase
  .from("products")
  .insert({ name: "하루온 미니", sku: "HO-MINI-01", unit_price: 1500 })
  .select()
  .single();
if (error) throw error;
```

## 수정

```typescript
const { data, error } = await supabase
  .from("inventory")
  .update({ quantity: 300 })
  .eq("product_id", productId)
  .select()
  .single();
if (error) throw error;
```

## 에러 처리 패턴

```typescript
const { data, error } = await supabase.from("products").select("*");
if (error) {
  console.error("조회 실패:", error.message);
  return { data: [], error };
}
return { data, error: null };
```

## RPC 호출

```typescript
const { data, error } = await supabase.rpc("create_order_with_stock_update", {
  p_product_id: productId,
  p_quantity: quantity,
});
if (error) throw error;
```

## 환경변수 사용

```typescript
// 올바른 방법: @/lib/supabase/client에서 가져오기
import { createBrowserClient } from "@/lib/supabase/client";
const supabase = createBrowserClient();

// 절대 금지: 키를 코드에 직접 넣지 않기
// const supabase = createClient("https://xxx.supabase.co", "eyJhb..."); ← 금지!
```

## Gotchas (주의사항)

- RLS 활성화 상태에서 anon key로 조회하면 빈 배열 반환 (에러가 아님!)
  → 개발 중 RLS 정책 설정 필요
- .single() 사용 시 결과 0개면 에러 발생
  → .maybeSingle() 사용 권장
- select('\*')는 기본 1000행 제한
  → 페이지네이션: .range(0, 49)
- insert/update 후 반드시 error 체크
  → const { data, error } = await ... if (error) throw error
- 날짜 필드는 ISO 8601 문자열로 전달 (Date 객체 X)
  → new Date().toISOString()
- 외래키 JOIN: select('_, products(_)')
- 환경변수는 항상 @/lib/supabase/client에서 가져오기
  → 절대 키를 코드에 직접 넣지 않기

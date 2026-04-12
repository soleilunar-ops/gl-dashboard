#!/bin/bash
npx supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > supabase/types.ts
echo "supabase/types.ts 재생성 완료"

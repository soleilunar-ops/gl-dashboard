#!/bin/bash
FILE="$CLAUDE_FILE_PATH"
if echo "$FILE" | grep -qE "^(CLAUDE\.md|supabase/|data/|src/lib/|src/components/ui/|src/components/layout/)"; then
  echo '{"message": "PM 관리 영역입니다. PM에게 요청하세요."}' >&2
fi
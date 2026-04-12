#!/bin/bash
RULES=$(cat PROJECT_RULES.md)
echo "$RULES" > .cursorrules
echo "$RULES" > GEMINI.md
echo "✅ .cursorrules, GEMINI.md 동기화 완료"
echo "⚠️ CLAUDE.md는 별도 관리 (30줄 요약본)"
echo "⚠️ .cursor/rules/*.mdc는 별도 관리 (YAML frontmatter)"

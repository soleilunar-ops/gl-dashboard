# PM 작업 로그 규칙

## 작업 시작 전 (필수)

- 현재 작업 영역에 맞는 로그 파일을 읽으세요:
  src/components/layout, src/components/shared, src/app → docs/logs/pm/frontend.md
  supabase/, data/ → docs/logs/pm/database.md
  services/api/ → docs/logs/pm/rag.md
  .github/, scripts/, 배포 관련 → docs/logs/pm/infra.md
- 이전 주의사항이 현재 작업에 영향을 주는지 확인하세요

## 작업 완료 후 (필수)

- 같은 로그 파일에 기록하세요:
  ### [날짜] [시간대]
  **요청:** (요청 내용 요약)
  **변경 파일:** (생성/수정한 파일 경로)
  **변경 내용:** (무엇을 왜 변경했는지 1-2줄)
  **주의사항:** (다른 파일에 영향 줄 수 있는 부분)

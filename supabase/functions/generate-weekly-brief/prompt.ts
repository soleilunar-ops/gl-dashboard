// 06 v0.3 — 공식 사내 보고서 톤 + Tool Use 기반 구조화 출력.
import type { SectionResult } from "./sqlSections.ts";

export interface RecentBriefSummary {
  week_start: string;
  headline: string;
  body: string;
}

export const SYSTEM_PROMPT = `당신은 지엘(GL) 하루온 브랜드의 주간 운영 리포트 작성자입니다.
공식 사내 보고서 형식으로 주간 리포트를 작성합니다.

# 절대 준수 — 한국어 자연어만
- **영어 원문·필드명·코드 값·괄호 주석 일체 금지**
- 예) approved, is_internal, pending, rejected, status, erp_system, sku_id, tx_date, gmv, units_sold, item_id, prompt_hash 같은 단어를 본문에 절대 쓰지 않습니다.
- SQL 결과에 나오는 필드명·조건식·영문 코드는 **모두 한국어 표현으로 변환**하여 서술합니다.
- 잘못된 예시: "승인(approved) · 외부(is_internal=false) 건수 7건"
- 올바른 예시: "승인이 완료된 외부 거래가 7건 집계되었습니다"

# 비전문가도 이해하는 쉬운 설명
- 읽는 사람이 데이터베이스·엑셀·통계 용어를 모른다고 가정합니다. (예: 엄마가 읽어도 이해될 수준)
- 업계 용어·약어 최소화. 모르면 즉시 한국어로 풀어 설명.
- **괄호( ) 사용 금지** — 영문 주석, 한글 부연설명 모두 포함.
  × "승인이 완료된 외부 거래 (사내 이동 제외)"
  ○ "사내 이동을 제외한 외부 거래 중 승인이 완료된 건"
- 숫자만 나열하지 말고 "무엇이 왜 중요한지" 한두 문장으로 풀어 설명.
- 예: "주문 7건 승인" 대신 "이번 주에는 외부 거래 주문 7건이 승인을 받아 정상 출고 준비가 완료되었습니다."

# 허용되는 숫자 · 금지되는 숫자 (최우선 규칙)
**허용되는 숫자 — 일상에서 바로 이해 가능한 실물 단위만**
- 기온: 도 (예: 영하 8도, 15.3도)
- 강수·적설: 밀리미터, 센티미터
- 실물 수량: 건, 개, 박스, 명, 원, 일
- 날짜·기간: 2025년 11월 17일, 3일, 2주
- 정수 반올림한 변동폭: 전주 대비 8% 증가 / 전년 대비 12% 감소

**금지되는 숫자 — 분석가용 추상 지표는 본문에 절대 노출 금지**
- 검색지수 절대값 (0.572, 0.815, 1.24 같은 0~2 범위의 정규화 수치)
- 이동평균값, ratio_to_ma, MA7, MA28 같은 통계 파생 수치
- 상관계수, R², p-value, 표준편차, 분산, z-score
- 소수점 이하 퍼센트 (37.8%, 12.3% → 반올림해서 38%, 12%)
- "지수 0.68", "계수 -0.42", "표준편차 1.2" 같은 수치화된 지표

**잘못된 예 ↔ 올바른 예**
- × "핫팩 검색지수 이동평균 0.572~0.755 구간에서 이동평균 하회 지속"
- ○ "핫팩을 찾는 소비자 관심도가 평소보다 낮은 수준에 머물러 있습니다."
- × "손난로 ratio_to_ma 0.68로 수요 둔화"
- ○ "손난로 검색량이 최근 한 달 평균보다 눈에 띄게 줄었습니다."
- × "4월 1주차 대비 표준편차 1.4σ 이탈"
- ○ "4월 1주차와 비교해 유난히 폭이 크게 벌어졌습니다."
- × "전주 대비 12.38% 감소"
- ○ "전주 대비 약 12% 감소"

# 전문 지표 → 일상 표현 치환
- 이동평균(MA) → "최근 한 달 평균", "최근 며칠 추세"
- search_index → "검색 관심도", "찾는 사람 수"
- ratio_to_ma → 숫자화 금지. "평소보다 낮음/높음/비슷함"으로 풀이
- 요일지수·계절지수 → "이 시기 평균 대비 ~한 흐름"
- 상관관계 → "~와 ~가 함께 움직이는 경향" 같이 풀어쓰기
- 감쇠·추세·모멘텀 → "점점 줄어드는 흐름", "반등 조짐"

# 온도 표기 규칙
- **°C, °F 기호 금지**. 모두 "도"로 표기.
- 영하는 "영하 N도" / 영상은 "N도" / 0도는 "0도".
- 예: -8°C → "영하 8도", 15°C → "15도", -0.5°C → "영하 0.5도"
- 기온차는 "전일보다 3도 낮아짐", "전년보다 7일 빠름" 같이 자연어.

# 톤 · 문체
- 경어체·격식체. 대표 어미는 「확인되었습니다」, 「예상됩니다」, 「집계되었습니다」.
- 이모지 금지. §, ', " 기호도 금지.
- 3인칭 객관적 보고. 1인칭 페르소나 금지.
- 추측 어휘 금지. 「~같아요」, 「아마도」 같은 표현 쓰지 말 것.
- ISO 주차 표기 금지. 2025년 11월 17일 형식의 실제 날짜 사용.

# 열거 표현 — 숫자 매기기 금지, 한국어 서수만
- 본문에서 항목을 나열할 때 **「1.」 「2.」 「3.」 형식 금지**.
- 반드시 **「첫째」 「둘째」 「셋째」 「넷째」** 로 서술.
- 문장형: "첫째, 파스형이 30% 늘었습니다. 둘째, ..." 형태
- 리스트 불릿(- 또는 *)도 가능하나, 가능하면 첫째/둘째 서술형 선호.
- 섹션 제목(sales_highlight / weather_trigger / transport)은 프론트엔드에서 숫자로 표시되므로 본문에서는 섹션 제목을 언급하지 말 것.

# 섹션 본문 작성 규칙
- 한국어 서술문. 마크다운 문법 불릿과 **굵게** 강조 사용 가능.
- 수평선(---, ***, ===) 사용 금지. 단락 구분은 빈 줄 하나로만.
- 출처 표기 태그 사용 금지. [ref:...], [sql.xxx], row_N 등 일체 기재 X.
- 쌍따옴표 사용 금지. 강조는 「 」 또는 **굵게**.
- 쿠팡 채널 수치와 지엘 ERP 수치를 합산하지 말고 각 축을 별도 문장으로 표기.
- 주문 수치 기본 기준은 사내 이동을 제외한 외부 거래 중 승인이 완료된 건.

# 숫자 표기 세부 규칙
- 기온: 소수점 유지 (6.15도, 영하 0.5도). SQL의 -6.15 를 615도로 쓰지 말 것.
- 실물 수량: 정수만, 천단위 쉼표 (1,234건 / 4,560개 / 89,000원).
- 퍼센트: 정수 반올림만 (37% O / 37.8% X / 0.378 같은 소수 형태 X).
- 추상 지표(검색지수·비율·상관계수 등)는 위 "금지되는 숫자" 규칙에 따라 본문에 수치로 쓰지 말 것.

# 인사이트 작성 규칙
- 이번 주 수치 + 최근 4주 요약을 바탕으로 "왜 이런 흐름인지" "무엇을 의미하는지" 해석.
- 데이터 서술은 인사이트가 아님. "이동평균 하락" "지수 하회" 같은 문장은 인사이트가 아니라 상태 요약.
- 인사이트는 반드시 (1) 원인 추정 또는 (2) 비즈니스 영향 또는 (3) 다음 주 행동 제안 중 하나를 포함.
- 단순 숫자 나열 금지. 원인·패턴·비교 중심으로 풀어쓰기.
- **헤드라인 1줄(60자 이내) → 본문 2~3문장(200자 이내) → 주의사항 2~3건 → 차주 주목 2~3건**
- 헤드라인은 "~ 고착화", "~ 지속" 같은 문자열 나열 대신 "무엇이 어떻게 됐고 그래서 뭘 해야 하나" 한 문장.
- 주의사항·차주 주목은 각 50자 이내 한 줄씩.

# 분량 제한 — 최우선 규칙
- **각 섹션 본문은 핵심 2~4문장, 300자 이내**. 중복·장황·반복 서술 금지.
- 한 섹션에 여러 소제목·여러 단락 쓰지 말 것. 한 단락 간결한 서술.
- 배경 설명·데이터 정의·산식 설명 금지. 오직 "이번 주 핵심 변화 1~2건"만.
- SQL 결과 전부 설명하려 하지 말 것. 가장 중요한 수치 1~2개만 골라서 해석.
- 섹션마다 "~되었습니다" 형태 문장 최대 3개까지만.
- 전체 리포트가 한 화면에서 스크롤 없이 읽히는 분량을 목표로 할 것.

# 리포트 구성 — 3섹션만
## 1. sales_highlight — 이번 주 판매 하이라이트
- 쿠팡 판매량(units_sold) 기준 전주 대비 **증가 TOP3** 카테고리 또는 제품 · 감소 TOP3
- 각 항목별로 "왜 올랐는지/내렸는지" 짧은 원인 해석 (날씨·검색·시즌·프로모션 중 하나)
- 증가 TOP3 각 품목에 대해 **쿠팡 재고**와 **지엘 창고 재고**를 매핑 조회해서
  "판매 속도 대비 쿠팡 재고 며칠치, 지엘 보충 여력 있음/주의" 형태로 판단 1~2문장 추가
- 단순 숫자 나열 금지. "파스형이 1,588개 팔렸습니다" 보다 "파스형이 전주보다 30% 늘어 1,588개 팔렸는데, 쿠팡 재고가 3일치밖에 남지 않아 지엘에서 즉시 보충 필요합니다" 형태

## 2. weather_trigger — 다음 주 날씨 · 트리거
- 차주 서울 기온 예보 (최고/최저, 소수점 유지)
- 발동된 트리거가 있으면 나열 (한파 급변, 첫 영하 기록, 검색 급등, 복합 트리거)
- 트리거 발동·미발동이 수요에 어떤 영향을 미칠지 해석 1~2문장
- 트리거 없으면 "특별한 수요 변동 요인 없음" 명시

## 3. transport — 운송 현황
- 진행 중인 수입 건 중 **차주 내 도착 예정**만 요약 (PO·품명·도착일·잔여일)
- 지연 건 있으면 별도 문장으로 (지연 일수·품명·영향 품목)
- 모두 정상이면 "지연 없이 진행 중" 한 줄

**삭제된 섹션**: 주문 현황(§1), 시즌 품목(§2 구), 총재고(§3), 쿠팡 밀크런(§5), 외부 신호(§6 구), 납품 미준수(§7). 관련 데이터는 인사이트의 주의사항으로만 편입.

# 용어 변환 가이드
- approved 또는 status=approved 는 「승인이 완료된」으로 표현
- pending 은 「승인 대기 중인」으로 표현
- rejected 는 「반려된」으로 표현
- is_internal=false 는 「외부 거래」로 표현하고, 사내 이동 제외를 설명하고 싶을 때는 별도 문장으로 풀어쓰기
- erp_system 값 gl / glpharm / hnb 는 각각 「지엘」 / 「지엘팜」 / 「에이치엔비」
- gmv 는 「매출」
- units_sold 는 「판매 수량」
- sku 는 「제품」
- tx_date 는 「거래일」
- first_freeze 는 「첫 영하 기록일」
- cold_shock 는 「한파 급변」
- temp_min / temp_max 는 「최저 기온」 / 「최고 기온」

출력은 반드시 submit_weekly_brief tool을 호출해 제공. 일반 텍스트 출력 금지.`;

export interface PromptInput {
  weekStart: string;
  weekEnd: string;
  template: "hotpack_season" | "off_season";
  sections: {
    orders: SectionResult;
    sectionTwo: SectionResult;
    inventory: SectionResult;
    importLt: SectionResult;
    milkrun: SectionResult;
    external: SectionResult;
    noncompliance: SectionResult;
  };
  recentBriefs: RecentBriefSummary[];
}

export function buildUserMessage(input: PromptInput): string {
  const { weekStart, weekEnd, template, sections, recentBriefs } = input;
  const sectionTwoKey = template === "hotpack_season" ? "hotpack_season" : "offseason";

  const recent =
    recentBriefs.length === 0
      ? "(최근 4주 요약 없음 — 이번이 최초 생성)"
      : recentBriefs
          .map((b, i) => `[${b.week_start} W-${i + 1}] 헤드라인: ${b.headline}\n본문: ${b.body}`)
          .join("\n\n");

  return `# 대상 주차
${weekStart} ~ ${weekEnd}
템플릿: ${template}
(sectionTwoKey=${sectionTwoKey} — 판매 TOP3 산출 시 이 축 우선 참고)

# 데이터 소스 (섹션 작성용 원재료)

## [쿠팡 판매 카테고리별 GMV/판매수량 — 이번 주]
${JSON.stringify(sections.sectionTwo.rows)}

## [ERP 주문 — 이번 주·전주]
${JSON.stringify(sections.orders.rows)}

## [총재고: 쿠팡(최신) · ERP(카테고리별) · 안전재고 경보]
${JSON.stringify(sections.inventory.rows)}

## [수입 리드타임: 진행 중 · 지연]
${JSON.stringify(sections.importLt.rows)}

## [쿠팡 밀크런 — 이번 주·차주 2주]
${JSON.stringify(sections.milkrun.rows)}

## [외부 신호: 서울 과거/예보 기상 · 키워드 최근 4주 · 신규 경쟁 상품]
${JSON.stringify(sections.external.rows)}

## [납품 미준수 — 이번 주]
${JSON.stringify(sections.noncompliance.rows)}

# 최근 4주 주간 리포트 요약 (참고 · 반복 금지)
${recent}

# 작성 지시
- **3섹션만 작성**: sales_highlight · weather_trigger · transport
- **sales_highlight**: 쿠팡 판매 카테고리별 GMV/판매수량 데이터에서 전주 대비 증가 TOP3와 감소 TOP3를 뽑아 원인 해석. 증가 TOP3 각각에 대해 쿠팡 재고·ERP 재고 매핑 판단(재고 며칠치·보충 필요 여부) 포함.
- **weather_trigger**: 기상 예보 데이터에서 차주 기온·트리거 추출해 해석. 과거 주 기상은 원인 설명용으로만 참조.
- **transport**: 수입 리드타임 데이터에서 차주 도착 예정·지연만 요약. 모두 정상이면 한 줄.
- **인사이트**: 세 섹션을 아우르는 핵심 변화와 그에 따른 다음 주 행동 제안.
- 자기완결형으로: 각 섹션은 "2026년 X월 Y째 주"처럼 시간 앵커 한 번 포함.

submit_weekly_brief tool을 호출해 최종 리포트를 제출하세요.`;
}

// Claude Messages API tool_use 스키마
export const REPORT_TOOL = {
  name: "submit_weekly_brief",
  description: "작성한 주간 리포트를 구조화해 제출합니다.",
  input_schema: {
    type: "object",
    required: ["metadata", "sections", "insight"],
    properties: {
      metadata: {
        type: "object",
        required: ["week_start", "week_end", "template"],
        properties: {
          week_start: { type: "string", description: "YYYY-MM-DD" },
          week_end: { type: "string", description: "YYYY-MM-DD" },
          template: {
            type: "string",
            enum: ["hotpack_season", "off_season"],
          },
        },
      },
      sections: {
        type: "object",
        required: ["sales_highlight", "weather_trigger", "transport"],
        description:
          "3개 섹션만. 각 섹션 2~4문장 300자 이내. 숫자 나열 금지, 원인·판단·행동 제안 중심.",
        properties: {
          sales_highlight: {
            type: "string",
            description:
              "1. 이번 주 판매 하이라이트 — 쿠팡 판매 증가 TOP3·감소 TOP3 + 원인 분석 + 증가 품목의 쿠팡/지엘 재고 매핑 판단",
          },
          weather_trigger: {
            type: "string",
            description: "2. 다음 주 날씨·트리거 — 차주 기온 예보 + 발동 트리거 + 수요 영향 해석",
          },
          transport: {
            type: "string",
            description: "3. 운송 현황 — 차주 도착 예정 PO + 지연 건. 모두 정상이면 한 줄",
          },
        },
      },
      insight: {
        type: "object",
        required: ["headline", "body", "alerts", "next_week"],
        properties: {
          headline: { type: "string", description: "한 줄 요약, 60자 이내" },
          body: { type: "string", description: "2~3문장 본문, 200자 이내" },
          alerts: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 3,
            description: "주의사항 2~3건, 각 50자 이내 한 줄",
          },
          next_week: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 3,
            description: "차주 주목 2~3건, 각 50자 이내 한 줄",
          },
        },
      },
    },
  },
};

/**
 * Claude Messages API tool_use 호출.
 * tool_choice로 반드시 submit_weekly_brief를 호출하도록 강제 → JSON syntax 에러 원천 차단.
 */
export async function callClaudeWithTool(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.systemPrompt,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "submit_weekly_brief" },
      messages: [{ role: "user", content: opts.userMessage }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude ${res.status}: ${t.slice(0, 500)}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((b: { type: string }) => b.type === "tool_use");
  if (!toolUse || !toolUse.input) {
    const stopReason = data.stop_reason;
    throw new Error(
      `Claude tool_use 블록 없음 (stop_reason=${stopReason}): ${JSON.stringify(data).slice(0, 400)}`
    );
  }
  return toolUse.input as Record<string, unknown>;
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

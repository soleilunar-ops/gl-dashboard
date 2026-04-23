import type { HaruruState } from "./_hooks/useHaruruWeather";

/**
 * 하루루 마스코트 PNG 시퀀스 설정.
 *
 * 시퀀스로 재생할 날씨 상태만 등록한다.
 *  - "구름 많음", "default"는 단일 이미지(bounce) 방식이라 여기서 제외
 *  - 파일 경로 규칙: /public/mascot/{dir}/{filename(i)}
 *  - filename 미지정 시 기본 패턴: frame-01.png ~ frame-NN.png
 */

type SequenceState = Exclude<HaruruState, "구름 많음" | "default">;

interface MascotConfig {
  /** 프레임 수 */
  count: number;
  /** 한 사이클 재생 시간(초) */
  duration: number;
  /** /public/mascot/{dir} 의 폴더명 */
  dir: string;
  /** 프레임 파일명 생성 함수 (i는 1부터 시작). 생략 시 frame-01.png 규칙 사용 */
  filename?: (i: number) => string;
  /** 실제 PNG 파일이 폴더에 배치됐는지. false면 기본 PNG(하루루 바운스)로 폴백 */
  populated: boolean;
}

// ezgif로 추출한 파일명 패턴 — 3자리 0-padding + -removebg-preview 접미사
const ezgifPattern = (i: number) =>
  `ezgif-frame-${String(i).padStart(3, "0")}-removebg-preview.png`;

// 새 시퀀스를 추가할 때 해당 상태의 populated를 true로 바꿔주세요.
const CONFIG: Record<SequenceState, MascotConfig> = {
  해: { count: 16, duration: 2.2, dir: "해", filename: ezgifPattern, populated: true },
  흐림: { count: 16, duration: 2.4, dir: "흐림", populated: false },
  비: { count: 16, duration: 2.0, dir: "비", populated: false },
  눈: { count: 16, duration: 2.4, dir: "눈", populated: false },
  바람: { count: 16, duration: 1.8, dir: "바람", populated: false },
  더움: { count: 16, duration: 2.0, dir: "더움", populated: false },
  추움: { count: 16, duration: 2.4, dir: "추움", populated: false },
};

const defaultFilename = (i: number) => `frame-${String(i).padStart(2, "0")}.png`;

function makeFrames(cfg: MascotConfig): string[] {
  const fn = cfg.filename ?? defaultFilename;
  return Array.from({ length: cfg.count }, (_, i) => `/mascot/${cfg.dir}/${fn(i + 1)}`);
}

export const MASCOT_FRAMES: Record<SequenceState, string[]> = Object.fromEntries(
  Object.entries(CONFIG).map(([state, cfg]) => [state, makeFrames(cfg)])
) as Record<SequenceState, string[]>;

export const MASCOT_DURATION: Record<SequenceState, number> = Object.fromEntries(
  Object.entries(CONFIG).map(([state, cfg]) => [state, cfg.duration])
) as Record<SequenceState, number>;

/** 시퀀스 재생 대상 상태인지 판별 — populated된 상태만 true. 미배치는 기본 PNG 폴백 */
export function isSequenceState(state: HaruruState): state is SequenceState {
  if (state === "구름 많음" || state === "default") return false;
  return CONFIG[state as SequenceState]?.populated ?? false;
}

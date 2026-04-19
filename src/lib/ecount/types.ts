import type { Frame, Page } from "playwright";

export type LocatorScope = Page | Frame;
export type RawXlsxRow = Record<string, unknown>;
export type InputHint = {
  id: string | null;
  name: string | null;
  type: string | null;
  placeholder: string | null;
};
export type FrameHints = { url: string; title?: string; inputs: InputHint[] };
export type CookieHint = { name: string; domain: string; path: string };

// 각 에러 경로별 debug 구조 — 경로별 필드가 달라 통합 타입 금지 (refactor.md §3.2 DON'T-1)
export type CompanyCodeFailureDebug = {
  current_url: string;
  frames: FrameHints[];
  frame_count: number;
  frame_urls: string[];
  page_text_snippet: string;
};

export type LoginFailureDebug = CompanyCodeFailureDebug & {
  cookies: CookieHint[];
};

export type FilterFailureDebug = CompanyCodeFailureDebug & {
  has_ledger_frame: boolean;
  ledger_frame_url: string | null;
};

export type ExcelButtonHint = {
  tag: string;
  id: string | null;
  text: string | null;
  dataCid: string | null;
  title: string | null;
};

export type ExcelFailureDebug = {
  current_url: string;
  frames: FrameHints[];
  frame_count: number;
  frame_urls: string[];
  has_ledger_frame: boolean;
  ledger_frame_url: string | null;
  all_buttons: ExcelButtonHint[];
};

export class EcountCompanyCodeError extends Error {
  readonly debug: CompanyCodeFailureDebug;
  constructor(message: string, debug: CompanyCodeFailureDebug) {
    super(message);
    this.name = "EcountCompanyCodeError";
    this.debug = debug;
  }
}

export class EcountLoginError extends Error {
  readonly debug: LoginFailureDebug;
  constructor(message: string, debug: LoginFailureDebug) {
    super(message);
    this.name = "EcountLoginError";
    this.debug = debug;
  }
}

export class EcountFilterError extends Error {
  readonly debug: FilterFailureDebug;
  constructor(message: string, debug: FilterFailureDebug) {
    super(message);
    this.name = "EcountFilterError";
    this.debug = debug;
  }
}

export class EcountExcelError extends Error {
  readonly debug: ExcelFailureDebug;
  constructor(message: string, debug: ExcelFailureDebug) {
    super(message);
    this.name = "EcountExcelError";
    this.debug = debug;
  }
}

export class EcountMappingError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = "EcountMappingError";
    this.hint = hint;
  }
}

export type ParsedLedgerRow = {
  date: string;
  counterparty: string;
  note: string;
  in_qty: number;
  out_qty: number;
  stock_qty: number;
};

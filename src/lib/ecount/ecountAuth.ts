import type { BrowserContext, Page } from "playwright";

import {
  clickFirst,
  collectCookieHints,
  collectFrameHints,
  fillFirst,
  getPageTextSnippet,
  getScopes,
} from "./playwright-helpers";
import { EcountCompanyCodeError, EcountLoginError } from "./types";

export function isLoginLikeUrl(url: string): boolean {
  return (
    url.includes("login.ecount.com") ||
    url.includes("/app.login/erp_login") ||
    url.includes("/Login/")
  );
}

function isPotentialAppUrl(url: string, companyCode: string): boolean {
  const lowered = url.toLowerCase();
  return (
    (lowered.includes(`${companyCode.toLowerCase()}.ecount.com`) ||
      lowered.includes(".ecount.com/e") ||
      lowered.includes("/ec5/")) &&
    !isLoginLikeUrl(lowered)
  );
}

export async function pickBestPageAfterLogin(
  context: BrowserContext,
  fallbackPage: Page,
  companyCode: string
): Promise<Page> {
  const pages = context.pages();
  const appPage = pages.find((p) => isPotentialAppUrl(p.url(), companyCode));
  if (appPage) return appPage;
  const nonBlank = pages.find((p) => p.url() && p.url() !== "about:blank" && p !== fallbackPage);
  return nonBlank ?? fallbackPage;
}

export async function detectLoginError(page: Page): Promise<string | null> {
  const snippet = await getPageTextSnippet(page);
  if (!snippet) return null;
  if (snippet.includes("아이디") && snippet.includes("비밀번호") && snippet.includes("로그인"))
    return "로그인에 실패했습니다. 회사코드/아이디/비밀번호를 확인해주세요.";
  if (snippet.includes("보안문자") || snippet.includes("captcha"))
    return "로그인 보안문자/차단 페이지가 표시되어 자동 크롤링이 불가능합니다.";
  return null;
}

export type EcountCredentials = {
  company: string;
  userId: string;
  password: string;
};

/**
 * 이카운트 로그인 플로우 전체 수행.
 * - 회사코드 입력 실패 → EcountCompanyCodeError
 * - 로그인 후에도 로그인 페이지에 머무름 → EcountLoginError
 * - 기타(id/password 입력 실패 등) → 원본 Error 그대로 bubble-up (route.ts 최상위 catch가 처리)
 */
export async function loginToEcount(
  page: Page,
  context: BrowserContext,
  creds: EcountCredentials
): Promise<Page> {
  await page.goto("https://login.ecount.com/Login/?lan_type=ko-KR/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(800);
  await page.waitForLoadState("networkidle").catch(() => {});

  const loginScopes = getScopes(page);

  // 회사코드 입력 — 실패 시 경로 고유 debug 포함 에러
  try {
    await fillFirst(
      loginScopes,
      [
        "#com_code",
        'input[name="com_code"]',
        'input[name="comCode"]',
        'input[name="company"]',
        'input[id*="com"][id*="code" i]',
        'input[placeholder*="회사"]',
        'input[placeholder*="Company"]',
      ],
      creds.company,
      "회사코드"
    );
  } catch (e) {
    const url = page.url().slice(0, 300);
    const frameHints = await collectFrameHints(page);
    const pageSnippet = await getPageTextSnippet(page);
    throw new EcountCompanyCodeError(
      (e instanceof Error ? e.message : "회사코드 입력 실패") + ` (현재 URL: ${url})`,
      {
        current_url: url,
        frames: frameHints,
        frame_count: frameHints.length,
        frame_urls: frameHints.map((f) => f.url).slice(0, 10),
        page_text_snippet: pageSnippet,
      }
    );
  }

  await fillFirst(
    loginScopes,
    [
      "#id",
      'input[name="id"]',
      'input[type="text"][autocomplete="username"]',
      'input[placeholder*="아이디"]',
    ],
    creds.userId,
    "아이디"
  );
  await fillFirst(
    loginScopes,
    ["#passwd", 'input[name="passwd"]', 'input[type="password"]'],
    creds.password,
    "비밀번호"
  );

  const popupPromise = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
  await clickFirst(
    loginScopes,
    ["#save", 'button[type="submit"]', 'input[type="submit"]', "text=로그인"],
    "로그인"
  );
  const maybePopup = await popupPromise;
  if (maybePopup) await maybePopup.waitForLoadState("domcontentloaded").catch(() => {});

  await page.waitForTimeout(1800);
  await page.waitForLoadState("networkidle").catch(() => {});

  const activePage = await pickBestPageAfterLogin(context, page, creds.company);
  await activePage.waitForLoadState("networkidle").catch(() => {});

  const currentUrl = activePage.url();
  const cookieHints = await collectCookieHints(context);
  const hasEcountCookie = cookieHints.some((c) => c.domain.includes("ecount.com"));

  if (isLoginLikeUrl(currentUrl)) {
    const loginError = await detectLoginError(activePage);
    const frameHints = await collectFrameHints(activePage);
    const pageSnippet = await getPageTextSnippet(activePage);
    const reason = !hasEcountCookie
      ? "로그인 요청이 세션 쿠키로 이어지지 않았습니다."
      : "세션 쿠키는 생성됐지만 앱 화면으로 전환되지 않았습니다.";
    throw new EcountLoginError(loginError ?? reason, {
      current_url: currentUrl.slice(0, 300),
      frames: frameHints,
      frame_count: frameHints.length,
      frame_urls: frameHints.map((f) => f.url).slice(0, 10),
      page_text_snippet: pageSnippet,
      cookies: cookieHints,
    });
  }

  return activePage;
}

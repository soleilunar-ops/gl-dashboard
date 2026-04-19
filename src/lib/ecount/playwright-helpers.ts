import type { BrowserContext, Page } from "playwright";

import type { CookieHint, FrameHints, LocatorScope } from "./types";

export function getScopes(page: Page): LocatorScope[] {
  return [page, ...page.frames()];
}

export async function getPageTextSnippet(page: Page): Promise<string> {
  try {
    const txt = await page.evaluate(() => document.body?.innerText ?? "");
    return txt.replace(/\s+/g, " ").slice(0, 300);
  } catch {
    return "";
  }
}

export async function collectFrameHints(page: Page): Promise<FrameHints[]> {
  const hints: FrameHints[] = [];
  for (const fr of page.frames()) {
    try {
      const url = fr.url();
      const inputs = await fr.evaluate(() =>
        Array.from(document.querySelectorAll("input"))
          .slice(0, 30)
          .map((el) => ({
            id: el.getAttribute("id"),
            name: el.getAttribute("name"),
            type: el.getAttribute("type"),
            placeholder: el.getAttribute("placeholder"),
          }))
      );
      let title: string | undefined;
      try {
        title = await fr.title();
      } catch {
        /* ignore */
      }
      hints.push({ url, title, inputs });
    } catch {
      hints.push({ url: fr.url(), inputs: [] });
    }
  }
  return hints;
}

export async function collectCookieHints(context: BrowserContext): Promise<CookieHint[]> {
  const cookies = await context.cookies();
  return cookies.slice(0, 30).map((c) => ({ name: c.name, domain: c.domain, path: c.path }));
}

// fillFirst: 여러 프레임 × 여러 셀렉터에서 첫 번째 입력 필드에 값 입력
// count() > 0 인 것만 시도 (visibility 무관하게 DOM에 존재하면 OK)
export async function fillFirst(
  scopes: LocatorScope[],
  selectors: string[],
  value: string,
  label: string
): Promise<void> {
  for (const scope of scopes) {
    for (const sel of selectors) {
      try {
        const loc = scope.locator(sel).first();
        if ((await loc.count()) > 0) {
          await loc.fill(value, { timeout: 3000 });
          return;
        }
      } catch {
        /* 다음 시도 */
      }
    }
  }
  throw new Error(`${label} 입력칸을 찾지 못했습니다. (페이지 구조 변경/로딩 실패 가능)`);
}

// clickFirst: 여러 프레임 × 여러 셀렉터에서 첫 번째 클릭 가능 요소 클릭
export async function clickFirst(
  scopes: LocatorScope[],
  selectors: string[],
  label: string
): Promise<void> {
  for (const scope of scopes) {
    for (const sel of selectors) {
      try {
        const loc = scope.locator(sel).first();
        if ((await loc.count()) > 0) {
          await loc.click({ timeout: 3000 });
          return;
        }
      } catch {
        /* 다음 시도 */
      }
    }
  }
  throw new Error(`${label} 버튼을 찾지 못했습니다. (페이지 구조 변경/로딩 실패 가능)`);
}

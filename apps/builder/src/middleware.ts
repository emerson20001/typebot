import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const IFRAME_AUTOLOGIN_SESSION_PREFIX = "cw_iframe_typebot_";
const IFRAME_AUTOLOGIN_ID_COOKIE = "cw_iframe_typebot_id";
const IFRAME_AUTOLOGIN_SESSION_COOKIE = "cw_iframe_typebot_session";
const SUPPORTED_LOCALES = new Set([
  "en",
  "fr",
  "pt",
  "pt-BR",
  "de",
  "ro",
  "es",
  "it",
  "el",
]);

export function middleware(req: NextRequest) {
  const { pathname, locale, defaultLocale, searchParams } = req.nextUrl;
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname === "/__ENV.js"
  ) {
    return NextResponse.next();
  }

  const normalizedPathname = stripLocalePrefix(pathname);

  const sessionToken =
    req.cookies.get("__Secure-authjs.session-token")?.value ??
    req.cookies.get("authjs.session-token")?.value;

  const isMostLikelySignedIn = Boolean(sessionToken);
  const iframeAutologinTypebotIdFromToken =
    extractIframeAutologinTypebotId(sessionToken);
  const iframeAutologinSessionCookie =
    req.cookies.get(IFRAME_AUTOLOGIN_SESSION_COOKIE)?.value ?? null;
  const hasIframeAutologinMarkers = Boolean(
    iframeAutologinSessionCookie || req.cookies.get(IFRAME_AUTOLOGIN_ID_COOKIE)?.value,
  );
  const isIframeAutologinSession =
    Boolean(sessionToken) &&
    Boolean(iframeAutologinSessionCookie) &&
    sessionToken === iframeAutologinSessionCookie;
  const iframeAutologinTypebotIdFromCookie =
    req.cookies.get(IFRAME_AUTOLOGIN_ID_COOKIE)?.value?.trim() || null;
  const iframeAutologinTypebotId = isIframeAutologinSession
    ? iframeAutologinTypebotIdFromCookie || iframeAutologinTypebotIdFromToken
    : null;

  if (!isIframeAutologinSession && hasIframeAutologinMarkers) {
    const response = NextResponse.next();
    response.cookies.delete(IFRAME_AUTOLOGIN_ID_COOKIE);
    response.cookies.delete(IFRAME_AUTOLOGIN_SESSION_COOKIE);
    return response;
  }

  if (
    iframeAutologinTypebotId &&
    (normalizedPathname === "/" || normalizedPathname === "/typebots")
  ) {
    const safeId = encodeURIComponent(iframeAutologinTypebotId);
    const allowedPath = `/typebots/${safeId}/edit`;
    const url = req.nextUrl.clone();
    url.pathname =
      locale && locale !== defaultLocale ? `/${locale}${allowedPath}` : allowedPath;
    return NextResponse.redirect(url);
  }

  if (iframeAutologinTypebotId) {
    const safeId = encodeURIComponent(iframeAutologinTypebotId);
    const allowedPath = `/typebots/${safeId}/edit`;
    if (normalizedPathname !== allowedPath) {
      const url = req.nextUrl.clone();
      url.pathname =
        locale && locale !== defaultLocale
          ? `/${locale}${allowedPath}`
          : allowedPath;
      return NextResponse.redirect(url);
    }
  }

  if (normalizedPathname === "/") {
    const toSignedIn =
      locale && locale !== defaultLocale ? `/${locale}/typebots` : "/typebots";
    const toSignin =
      locale && locale !== defaultLocale ? `/${locale}/signin` : "/signin";

    const url = req.nextUrl.clone();
    url.pathname = isMostLikelySignedIn ? toSignedIn : toSignin;

    return NextResponse.redirect(url);
  } else if (normalizedPathname === "/typebots") {
    const callbackUrl = searchParams.get("callbackUrl");
    const redirectPath = sanitizeRedirectPath(
      searchParams.get("redirectPath") ??
        (callbackUrl
          ? new URL(callbackUrl).searchParams.get("redirectPath")
          : undefined),
    );
    if (!redirectPath) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = redirectPath;
    url.searchParams.delete("callbackUrl");
    url.searchParams.delete("redirectPath");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  if (!SUPPORTED_LOCALES.has(segments[0])) return pathname;

  const stripped = `/${segments.slice(1).join("/")}`;
  return stripped === "/" ? "/" : stripped.replace(/\/+$/, "");
}

function extractIframeAutologinTypebotId(
  sessionToken: string | undefined,
): string | null {
  if (!sessionToken?.startsWith(IFRAME_AUTOLOGIN_SESSION_PREFIX)) return null;
  const [, , , ...rest] = sessionToken.split("_");
  const typebotId = rest.slice(0, -1).join("_");
  if (!typebotId || !/^[a-zA-Z0-9]+$/.test(typebotId)) return null;
  return typebotId;
}

function sanitizeRedirectPath(
  redirectPath: string | null | undefined,
): string | null {
  if (!redirectPath) return null;

  try {
    // Prevent absolute URLs
    const url = new URL(redirectPath, "http://dummy"); // base needed for parsing
    if (url.origin !== "http://dummy") return null; // absolute external URL → reject

    const safePath = url.pathname + url.search + url.hash;

    return safePath;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/:path*"],
};

import { NextRequest, NextResponse } from "next/server";

const defaultWindowMs = 60_000;
const defaultMaxRequests = 30;
const protectedMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type ProtectionOptions = {
  requireApiKey?: boolean;
  rateLimit?: {
    windowMs?: number;
    maxRequests?: number;
  };
};

type ProtectionResult =
  | { ok: true }
  | {
      ok: false;
      response: NextResponse;
    };

const buckets = new Map<string, RateLimitEntry>();

export function protectApiRoute(request: NextRequest, options: ProtectionOptions = {}): ProtectionResult {
  const hasApiKey = hasValidApiKey(request);

  if (!hasApiKey && !isSameOrigin(request)) {
    return denied("Cross-origin API access is not allowed.", 403);
  }

  if ((options.requireApiKey || protectedMethods.has(request.method)) && !hasApiKey && !allowLocalDevelopment()) {
    return denied("Unauthorized.", 401);
  }

  const rateLimit = options.rateLimit || {};
  const windowMs = rateLimit.windowMs || defaultWindowMs;
  const maxRequests = rateLimit.maxRequests || defaultMaxRequests;
  const clientKey = `${request.nextUrl.pathname}:${clientAddress(request)}`;
  const now = Date.now();
  const bucket = buckets.get(clientKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(clientKey, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  bucket.count += 1;

  if (bucket.count > maxRequests) {
    return denied("Too many requests.", 429, {
      "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000))
    });
  }

  return { ok: true };
}

export function protectedJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  setProtectionHeaders(headers);

  return NextResponse.json(body, {
    ...init,
    headers
  });
}

function denied(message: string, status: number, headers?: HeadersInit): ProtectionResult {
  return {
    ok: false,
    response: protectedJson({ error: message }, { status, headers })
  };
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin) {
    return origin === request.nextUrl.origin;
  }

  if (referer) {
    try {
      return new URL(referer).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  return process.env.NODE_ENV !== "production";
}

function hasValidApiKey(request: NextRequest) {
  const configuredKey = process.env.REPORTING_API_KEY;

  if (!configuredKey) {
    return false;
  }

  return request.headers.get("x-reporting-api-key") === configuredKey;
}

function allowLocalDevelopment() {
  return process.env.NODE_ENV !== "production" && !process.env.REPORTING_API_KEY;
}

function clientAddress(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function setProtectionHeaders(headers: Headers) {
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
}

import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "./runtime.mjs";

class Reply extends Response {
  constructor(body, init) {
    super(body, init);
    this.savedCookies = new Map();
    this.cookies = {
      set: (name, value, options) => this.savedCookies.set(name, { value, options }),
    };
  }
  static json(value, init = {}) {
    return new Reply(JSON.stringify(value), {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  }
  static redirect(url, status = 307) {
    return new Reply(null, { status, headers: { Location: String(url) } });
  }
}
const origin = "https://club.test";
function setup() {
  const oldSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-google-linking-secret-that-is-not-a-production-key";
  let current = {
    id: "existing-ana",
    username: "ana",
    name: "Ana",
    role: "player",
    playerId: "player-ana",
  };
  let payload = {
    sub: "google-ana",
    email: "ana@gmail.com",
    email_verified: true,
    nonce: "",
  };
  let enabled = true;
  const flows = new Map(),
    links = new Map(),
    prefs = new Set(),
    users = new Map([[current.id, current]]);
  const calls = { exchanges: [], verifications: [], sessions: [], links: 0 };
  const runtime = createRuntime({
    mocks: {
      "next/server": { NextResponse: Reply },
      "@/lib/auth/google-config": {
        googleAuthEnabled: () => enabled,
        googleAuthConfig: () => {
          if (!enabled) throw new Error("disabled");
          return {
            clientId: "client-id",
            clientSecret: "client-secret",
            origin,
            callbackUrl: origin + "/api/auth/google/callback",
          };
        },
      },
      "@/lib/auth/session": { getCurrentUser: async () => current },
      "@/lib/auth/jwt": {
        createSessionToken: async (user) => {
          calls.sessions.push(user);
          return "signed-existing-account";
        },
      },
      "@/services/auth/google-user": {
        resolveGoogleUser: async (id) => users.get(id) ?? null,
      },
      "@/services/database/google-auth-store": {
        GoogleAuthStore: class {
          async createFlow(state, mode, userId) {
            flows.set(state, { mode, user_id: userId });
          }
          async consumeFlow(state) {
            const flow = flows.get(state);
            flows.delete(state);
            return flow;
          }
          async userIdForSubject(sub) {
            return links.get(sub)?.userId ?? null;
          }
          async link(userId, sub, email) {
            if (
              [...links].some(
                ([s, i]) =>
                  (s === sub || i.userId === userId) &&
                  (s !== sub || i.userId !== userId),
              )
            )
              throw new Error("GOOGLE_ALREADY_LINKED");
            calls.links++;
            links.set(sub, { userId, email });
          }
          async status(userId) {
            const identity = [...links.values()].find((i) => i.userId === userId);
            return {
              linked: !!identity,
              email: identity?.email ?? null,
              dismissed: prefs.has(userId),
            };
          }
          async dismiss(userId) {
            prefs.add(userId);
          }
        },
      },
      "google-auth-library": {
        CodeChallengeMethod: { S256: "S256" },
        OAuth2Client: class {
          async generateCodeVerifierAsync() {
            return {
              codeVerifier: "private-browser-verifier",
              codeChallenge: "public-challenge",
            };
          }
          generateAuthUrl(options) {
            return (
              "https://accounts.google.com/o/oauth2/v2/auth?" +
              new URLSearchParams(options)
            );
          }
          async getToken(input) {
            calls.exchanges.push(input);
            return { tokens: { id_token: "id-token-from-code-exchange" } };
          }
          async verifyIdToken(input) {
            calls.verifications.push(input);
            return { getPayload: () => payload };
          }
        },
      },
    },
  });
  const start = runtime.load("app/api/auth/google/start/route.ts");
  const callback = runtime.load("app/api/auth/google/callback/route.ts");
  const status = runtime.load("app/api/auth/google/status/route.ts");
  const oauth = runtime.load("lib/auth/google.ts");
  function request(path, { method = "GET", form, requestOrigin = origin, cookie } = {}) {
    const r = new Request(origin + path, {
      method,
      headers: { Origin: requestOrigin },
      body: form,
    });
    r.nextUrl = new URL(r.url);
    r.cookies = {
      get: (name) =>
        name === oauth.GOOGLE_FLOW_COOKIE && cookie ? { value: cookie } : undefined,
    };
    return r;
  }
  async function begin(mode = "link", extra = {}) {
    const form = new FormData();
    form.set("mode", mode);
    form.set("userId", "victim");
    form.set("redirectTo", extra.redirectTo ?? "/mi-cuota");
    const response = await start.POST(
      request("/api/auth/google/start", { method: "POST", form, ...extra }),
    );
    if (response.status !== 303) return { response };
    const url = new URL(response.headers.get("location"));
    const cookie = response.savedCookies.get(oauth.GOOGLE_FLOW_COOKIE)?.value;
    const state = url.searchParams.get("state");
    payload = { ...payload, nonce: url.searchParams.get("nonce") };
    return { response, url, state, cookie };
  }
  function finish(flow, query = "code=authorization-code") {
    return callback.GET(
      request(`/api/auth/google/callback?state=${flow.state}&${query}`, {
        cookie: flow.cookie,
      }),
    );
  }
  return {
    begin,
    finish,
    start,
    callback,
    status,
    oauth,
    request,
    calls,
    flows,
    links,
    prefs,
    users,
    user: () => current,
    setUser: (user) => {
      current = user;
    },
    setPayload: (change) => {
      payload = { ...payload, ...change };
    },
    disable: () => {
      enabled = false;
    },
    cleanup: () => {
      if (oldSecret === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = oldSecret;
    },
  };
}

test("Google linking uses the existing signed-in ID, PKCE and nonce; replay cannot link twice", async () => {
  const x = setup();
  try {
    const flow = await x.begin();
    assert.equal(flow.url.hostname, "accounts.google.com");
    assert.equal(flow.url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(flow.url.searchParams.get("scope"), "openid,email");
    const cookie = flow.response.savedCookies.get(x.oauth.GOOGLE_FLOW_COOKIE);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.sameSite, "lax");
    assert.equal(cookie.options.maxAge, 600);
    const response = await x.finish(flow);
    assert.equal(response.headers.get("location"), origin + "/account?google=linked");
    assert.equal(x.links.get("google-ana").userId, "existing-ana");
    assert.equal(x.calls.sessions.length, 0);
    assert.equal(x.calls.exchanges[0].codeVerifier, "private-browser-verifier");
    assert.equal(x.calls.verifications[0].audience, "client-id");
    assert.match((await x.finish(flow)).headers.get("location"), /google=expired/);
    assert.equal(x.calls.links, 1);
  } finally {
    x.cleanup();
  }
});
test("Google login preserves current account IDs, player ownership and permissions", async () => {
  const x = setup();
  try {
    x.links.set("google-ana", { userId: x.user().id, email: "ana@gmail.com" });
    x.users.set(x.user().id, { ...x.user(), role: "fan", playerId: undefined });
    x.setUser(null);
    const response = await x.finish(await x.begin("login"));
    assert.equal(response.headers.get("location"), origin + "/mi-cuota");
    assert.equal(x.calls.sessions[0].id, "existing-ana");
    assert.equal(x.calls.sessions[0].role, "fan");
    assert.equal(x.calls.sessions[0].playerId, undefined);
    assert.equal(
      response.savedCookies.get("dashboard_session").value,
      "signed-existing-account",
    );
    assert.equal(x.calls.links, 0);
  } finally {
    x.cleanup();
  }
});
test("an unlinked Google subject never matches by email or creates an account", async () => {
  const x = setup();
  try {
    x.links.set("other-google-sub", { userId: x.user().id, email: "ana@gmail.com" });
    x.setUser(null);
    const response = await x.finish(await x.begin("login"));
    assert.match(response.headers.get("location"), /google=not-linked/);
    assert.equal(x.calls.sessions.length, 0);
    assert.equal(x.calls.links, 0);
    assert.equal(x.users.size, 1);
  } finally {
    x.cleanup();
  }
});
test("linking rejects a changed/expired local session and cross-origin initiation", async () => {
  const x = setup();
  try {
    const flow = await x.begin();
    x.setUser({ ...x.user(), id: "other-user" });
    assert.match(
      (await x.finish(flow)).headers.get("location"),
      /google=session-changed/,
    );
    assert.equal(x.calls.exchanges.length, 0);
    assert.equal(x.links.size, 0);
    assert.equal(
      (await x.begin("link", { requestOrigin: "https://attacker.test" })).response.status,
      403,
    );
    x.setUser(null);
    assert.match((await x.begin()).response.headers.get("location"), /\/login\?/);
  } finally {
    x.cleanup();
  }
});
test("OAuth rejects cookie tampering, mismatched state, unverified email and nonce substitution", async () => {
  const x = setup();
  try {
    for (const mutation of ["tamper", "state", "nonce", "email"]) {
      const flow = await x.begin();
      if (mutation === "tamper") flow.cookie = flow.cookie.slice(0, -5) + "xxxxx";
      if (mutation === "state") flow.state = "attack-state";
      if (mutation === "nonce") x.setPayload({ nonce: "another-browser" });
      if (mutation === "email") x.setPayload({ email_verified: false });
      assert.match((await x.finish(flow)).headers.get("location"), /google=failed/);
      assert.equal(x.links.size, 0);
      x.setPayload({ email_verified: true });
    }
  } finally {
    x.cleanup();
  }
});
test("cancelled, already-linked and missing-flow callbacks leave current accounts untouched", async () => {
  const x = setup();
  try {
    const cancelled = await x.begin();
    assert.match(
      (await x.finish(cancelled, "error=access_denied")).headers.get("location"),
      /google=cancelled/,
    );
    assert.equal(x.calls.exchanges.length, 0);
    x.links.set("google-ana", { userId: "different-account", email: "ana@gmail.com" });
    assert.match(
      (await x.finish(await x.begin())).headers.get("location"),
      /google=already-linked/,
    );
    assert.equal(x.links.get("google-ana").userId, "different-account");
    const expired = await x.begin();
    x.flows.clear();
    assert.match((await x.finish(expired)).headers.get("location"), /google=expired/);
    assert.equal(x.calls.sessions.length, 0);
  } finally {
    x.cleanup();
  }
});
test("No tengo Gmail persists only for the current user and linking remains available", async () => {
  const x = setup();
  try {
    const user = x.user();
    assert.equal((await (await x.status.GET()).json()).dismissed, false);
    assert.equal(
      (await x.status.POST(x.request("/api/auth/google/status", { method: "POST" })))
        .status,
      200,
    );
    assert.equal((await (await x.status.GET()).json()).dismissed, true);
    x.setUser({ ...user, id: "different-user" });
    assert.equal((await (await x.status.GET()).json()).dismissed, false);
    x.setUser(user);
    await x.finish(await x.begin());
    const linked = await (await x.status.GET()).json();
    assert.equal(linked.linked, true);
    assert.equal(linked.dismissed, true);
    assert.equal(
      (
        await x.status.POST(
          x.request("/api/auth/google/status", {
            method: "POST",
            requestOrigin: "https://attacker.test",
          }),
        )
      ).status,
      403,
    );
    x.setUser(null);
    assert.equal((await x.status.GET()).status, 401);
    assert.equal(
      (await x.status.POST(x.request("/api/auth/google/status", { method: "POST" })))
        .status,
      401,
    );
  } finally {
    x.cleanup();
  }
});
test("OAuth return paths cannot redirect to another site; unconfigured login stays disabled", async () => {
  const x = setup();
  try {
    for (const path of [
      "https://attacker.test",
      "//attacker.test",
      "/\\attacker.test",
      "/\n/attacker.test",
      "/api/auth/google/start",
      "/login",
    ])
      assert.equal(x.oauth.googleReturnTo(path), "/");
    x.disable();
    assert.equal((await x.begin("login")).response.status, 503);
    assert.deepEqual(await (await x.status.GET()).json(), { enabled: false });
  } finally {
    x.cleanup();
  }
});

test("OAuth configuration trims pasted whitespace and keeps blank credentials disabled", () => {
  const keys = ["AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.AUTH_SECRET = "test-only-auth-secret";
    process.env.GOOGLE_CLIENT_ID = " test-client.apps.googleusercontent.com\n";
    process.env.GOOGLE_CLIENT_SECRET = " test-only-client-secret\n";
    const runtime = createRuntime({
      mocks: {
        "@/services/database/directory-store": { directoryDatabaseEnabled: () => true },
      },
    });
    const config = runtime.load("lib/auth/google-config.ts");
    assert.equal(config.googleAuthEnabled(), true);
    assert.equal(
      config.googleAuthConfig().clientId,
      "test-client.apps.googleusercontent.com",
    );
    assert.equal(config.googleAuthConfig().clientSecret, "test-only-client-secret");
    process.env.GOOGLE_CLIENT_SECRET = " \n ";
    assert.equal(config.googleAuthEnabled(), false);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

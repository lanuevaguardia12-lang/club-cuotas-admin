import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

const config = {
  spreadsheetId: "test-app",
  matchesSpreadsheetId: "test-matches",
  clubSpreadsheetId: "test-club",
  clientEmail: "test@example.com",
  privateKey: "TEST-ONLY",
};
const leagueMock = {
  APP_TEAM_NAME: "La Nueva Guardia",
  LEAGUE_CACHE_TAG: "league-fixture:snapshot",
  getLeagueClubMatchesForYear: async () => [],
  withLeagueSnapshot: (work) => work(),
};
function serviceRuntime() {
  const sheets = createSheetsMock({
    Jugadores: [
      ["id", "nombre", "estado", "categoria", "email", "telefono", "foto_perfil"],
      [
        "ana",
        "Ana Perez",
        "activo",
        "Primera",
        "ana@example.com",
        "111",
        "data:image/jpeg;base64,AAAA",
      ],
      ["bea", "Bea Gomez", "activo", "Primera", "bea@example.com", "222", ""],
    ],
    Cuotas: [
      ["id", "jugador_id", "periodo", "monto", "estado", "fecha_pago"],
      ["fee-ana", "ana", "2026-10", 10000, "pagada", "2026-10-05"],
      ["fee-bea", "bea", "2026-10", 10000, "pendiente", ""],
    ],
    CuentasUsuario: [
      ["user_id", "username", "rol", "nombre", "email"],
      ["ana", "ana", "player", "Ana Perez", "ana@example.com"],
      ["fan", "fan", "fan", "Hincha", "fan@example.com"],
    ],
    Configuracion: [
      ["club_name", "Club de prueba"],
      ["monthly_fee", 10000],
    ],
    CalculadoraCostos: [],
    CalculadoraReales: [],
    CalculadoraJugadores: [],
    "Politica devoluciones": [],
    "Partidos jugados formulario": [],
    "Respuestas de formulario": [],
    "Respuesta de formulario": [],
    "Gastos nueva guardia": [],
    AsistenciasJugadores: [],
    Auditoria: [],
    Logs: [],
    Notificaciones: [],
    Recordatorios: [],
    Pagos: [],
    FixtureAjustes: [],
    JugadorPartidoVotos: [],
    JugadorPartidoAjustes: [],
    PushSubscriptions: [],
  });
  const runtime = createRuntime({
    mocks: { googleapis: sheets.googleapis, "@/lib/league-fixture": leagueMock },
  });
  const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
  return {
    ...runtime,
    sheets,
    service: new GoogleSheetsService(config),
    GoogleSheetsService,
  };
}

test("league slots match all three Argentina schedules and their boundaries", () => {
  const { getLeagueRefreshSlot } = createRuntime().load("lib/league-refresh-schedule.ts");
  for (const [now, expected] of [
    ["2026-10-19T13:59:59Z", "2026-10-14T14:00:00.000Z"],
    ["2026-10-19T14:00:00Z", "2026-10-19T14:00:00.000Z"],
    ["2026-10-19T19:59:59Z", "2026-10-19T14:00:00.000Z"],
    ["2026-10-19T20:00:00Z", "2026-10-19T20:00:00.000Z"],
    ["2026-10-21T13:59:59Z", "2026-10-19T20:00:00.000Z"],
    ["2026-10-21T14:00:00Z", "2026-10-21T14:00:00.000Z"],
    ["2026-10-26T13:59:59Z", "2026-10-21T14:00:00.000Z"],
  ])
    assert.equal(getLeagueRefreshSlot(new Date(now)), expected);
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url)));
  assert.deepEqual(
    vercel.crons
      .filter((cron) => cron.path === "/api/cron/league-fixture")
      .map((cron) => cron.schedule),
    ["0 14 * * 1,3", "0 20 * * 1"],
  );
});

function leagueMetadata(categories = 1) {
  const entries = Array.from({ length: categories }, (_, index) => ({
    id: String(index + 20),
    torneo_id: "10",
    deporte: { name: "Futbol Mayores" },
    categoria: { name: `Primera ${index}` },
  }));
  return `<select id="la_torneo"><option value="10">Clausura 2026</option></select>var campeonatosXTorneo = ${JSON.stringify({ 10: entries })}\n    ;`;
}
function leagueHtml(points = 3) {
  return `<table class="alt-table"><tbody><tr><td>1</td><td><span class="team-nm">Barrio Dorrego</span></td><td>1</td><td>1</td><td>0</td><td>0</td><td>2</td><td>0</td><td>${points}</td></tr></tbody></table><div class="alt-round"><span class="alt-round-badge">Fecha 1</span><span class="alt-round-date">18 de octubre</span><div class="alt-match" data-fixture-hashed="match-1"><div class="amd-team amd-local">Barrio Dorrego</div><div class="amd-team amd-visitor">Visitante</div><div class="amd-score">2 - 0</div></div></div>`;
}

test("league snapshot is shared across screens, refreshes by slot and survives failures without repeated requests", async () => {
  let requests = 0,
    points = 3,
    fail = false;
  const runtime = createRuntime({
    fetchImpl: async (url) => {
      requests++;
      if (fail) throw new Error("League offline");
      return new Response(
        url.endsWith("/futbol") ? leagueMetadata() : leagueHtml(points),
      );
    },
  });
  const league = runtime.load("lib/league-fixture.ts");
  let data = await league.getLeagueFixtureData();
  assert.equal(data.source.status, "ready");
  assert.equal(data.standings[0].points, 3);
  assert.equal(requests, 2);
  await league.getLeagueFixtureData({ competition: "10:20" });
  await league.getLeagueClubMatchesForYear(2026);
  await league.withLeagueSnapshot(() =>
    runtime.nextCache.unstable_cache(
      () => league.getLeagueClubMatchesForYear(2026),
      ["nested-profile"],
      { revalidate: false },
    )(),
  );
  assert.equal(
    requests,
    2,
    "navigation and nested profile caches must not contact the league",
  );

  runtime.clock.now = Date.parse("2026-10-19T20:00:00Z");
  points = 6;
  assert.equal((await league.getLeagueFixtureData()).standings[0].points, 3);
  assert.equal(requests, 2, "visitors keep the last copy until the cron runs");
  await league.refreshLeagueFixtureCache();
  data = await league.getLeagueFixtureData();
  assert.equal(data.standings[0].points, 6);
  assert.equal(requests, 4);
  runtime.clock.now = Date.parse("2026-10-21T13:59:59Z");
  await league.getLeagueFixtureData();
  assert.equal(requests, 4);

  runtime.clock.now = Date.parse("2026-10-21T14:00:00Z");
  fail = true;
  await assert.rejects(league.refreshLeagueFixtureCache(), /offline/);
  assert.equal((await league.getLeagueFixtureData()).standings[0].points, 6);
  await league.getLeagueFixtureData();
  assert.equal(requests, 5, "failed scheduled refreshes must not retry on navigation");
  runtime.clock.now = Date.parse("2026-10-26T14:00:00Z");
  fail = false;
  points = 9;
  await league.refreshLeagueFixtureCache();
  assert.equal((await league.getLeagueFixtureData()).standings[0].points, 9);
});

test("league refresh caps upstream concurrency", async () => {
  let active = 0,
    maximum = 0;
  const runtime = createRuntime({
    fetchImpl: async (url) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return new Response(url.endsWith("/futbol") ? leagueMetadata(9) : leagueHtml());
    },
  });
  const league = runtime.load("lib/league-fixture.ts");
  assert.equal((await league.refreshLeagueFixtureCache()).competitions, 9);
  assert.ok(maximum <= 6);
});

test("season results are shared across users, preserve paid status and refresh after a payment", async () => {
  const { service, sheets, GoogleSheetsService, expired } = serviceRuntime();
  const ana = await service.getPlayerProfile("ana", 2026);
  assert.ok(ana);
  assert.equal(ana.months.find((month) => month.period === "2026-10").status, "paid");
  const reads = sheets.calls.reads;
  const bea = await new GoogleSheetsService(config).getPlayerProfile("bea", 2026);
  assert.equal(bea.months.find((month) => month.period === "2026-10").status, "unpaid");
  assert.deepEqual(await service.getPlayerProfile("ana@example.com", 2026), ana);
  assert.equal(
    sheets.calls.reads,
    reads,
    "another player or alias reuses the same season snapshot",
  );
  assert.ok(!JSON.stringify(ana).includes("base64"));
  const writes = sheets.calls.writes;
  await service.updatePlayerFeeStatus({
    playerId: "bea",
    period: "2026-10",
    status: "paid",
  });
  assert.equal(sheets.calls.writes, writes + 1);
  const updated = await service.getPlayerProfile("bea", 2026);
  assert.equal(updated.months.find((month) => month.period === "2026-10").status, "paid");
  assert.ok(sheets.calls.reads > reads);
  assert.ok(!expired.includes("google-sheets"), "a payment must not expire every cache");
});

test("account cache is isolated by user and refreshed after editing the profile", async () => {
  const { service, sheets, GoogleSheetsService } = serviceRuntime();
  const fan = { id: "fan", username: "fan", role: "fan", name: "Hincha" };
  const first = await service.getAccountProfile(fan);
  const reads = sheets.calls.reads;
  assert.deepEqual(await new GoogleSheetsService(config).getAccountProfile(fan), first);
  assert.equal(sheets.calls.reads, reads);
  assert.equal(
    (
      await service.getAccountProfile({
        ...fan,
        id: "different",
        username: "different",
        name: "Otra persona",
      })
    ).profile.userId,
    "different",
  );
  await service.updateAccountProfile({
    userId: fan.id,
    username: fan.username,
    role: fan.role,
    name: "Nombre actualizado",
    email: "new@example.com",
  });
  const updated = await service.getAccountProfile(fan);
  assert.equal(updated.profile.name, "Nombre actualizado");
  assert.equal(updated.profile.email, "new@example.com");
});

test("reading or creating notifications does not invalidate account or quota snapshots", async () => {
  const { service, sheets } = serviceRuntime();
  const fan = { id: "fan", username: "fan", role: "fan", name: "Hincha" };
  const profile = await service.getAccountProfile(fan);
  const quota = await service.getPlayerProfile("ana", 2026);
  await service.createNotification({
    title: "Aviso",
    message: "Prueba",
    type: "info",
    targetRole: "player",
  });
  await service.recordAuditEvent({
    actor: { id: "test", name: "Test", role: "system" },
    action: "notification.read",
    entityType: "notification",
    entityId: "test",
    summary: "Prueba",
  });
  const reads = sheets.calls.reads;
  assert.deepEqual(await service.getAccountProfile(fan), profile);
  assert.deepEqual(await service.getPlayerProfile("ana", 2026), quota);
  assert.equal(sheets.calls.reads, reads);
});

test("independent Sheets reads run concurrently and reuse one client", async () => {
  const { service, sheets } = serviceRuntime();
  await service.getPremiumData();
  assert.ok(sheets.calls.maxActive > 1);
  assert.equal(sheets.calls.clients, 1);
});

test("temporary Sheets errors do not freeze an empty financial snapshot", async () => {
  const { service, sheets } = serviceRuntime();
  sheets.failReads(new Error("429 Too Many Requests"));
  assert.equal(await service.getPlayerProfile("ana", 2026), null);
  sheets.failReads(undefined);
  assert.equal((await service.getPlayerProfile("ana", 2026)).id, "ana");
});

test("a league outage does not prevent cached personal profile work", async () => {
  let requests = 0;
  const runtime = createRuntime({
    fetchImpl: async () => {
      requests++;
      throw new Error("League offline");
    },
  });
  const league = runtime.load("lib/league-fixture.ts");
  const profile = { name: "Ana Perez", email: "ana@example.com" };
  const result = await league.withLeagueSnapshot(() =>
    runtime.nextCache.unstable_cache(
      async () => {
        await league.getLeagueClubMatchesForYear(2026);
        return profile;
      },
      ["profile-with-unavailable-league"],
      { revalidate: false },
    )(),
  );
  assert.deepEqual(result, profile);
  assert.equal(requests, 1);
});

test("a cached response does not import or authenticate the Google client", async () => {
  let imports = 0;
  const sheets = createSheetsMock({ Configuracion: [["club_name", "Club de prueba"]] });
  const mocks = {
    get googleapis() {
      imports++;
      return sheets.googleapis;
    },
    "@/lib/league-fixture": leagueMock,
  };
  const runtime = createRuntime({ mocks });
  const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
  assert.equal(imports, 0);
  const first = await new GoogleSheetsService(config).getAppSettings();
  assert.equal(imports, 1);
  const reads = sheets.calls.reads;
  assert.deepEqual(await new GoogleSheetsService(config).getAppSettings(), first);
  assert.equal(imports, 1);
  assert.equal(sheets.calls.reads, reads);
  assert.equal(sheets.calls.clients, 1);
});

test("an unavailable historical match detail does not block a standings update", async () => {
  const runtime = createRuntime({
    fetchImpl: async (url) => {
      if (url.endsWith("/futbol")) return new Response(leagueMetadata());
      if (url.includes("/detail/"))
        return new Response("Missing detail", { status: 404 });
      return new Response(
        leagueHtml(12).replace(
          'data-fixture-hashed="match-1"',
          'data-fixture-hashed="match-1" data-detail-url="/detail/old-match"',
        ),
      );
    },
  });
  const league = runtime.load("lib/league-fixture.ts");
  await league.refreshLeagueFixtureCache();
  assert.equal((await league.getLeagueFixtureData()).standings[0].points, 12);
});

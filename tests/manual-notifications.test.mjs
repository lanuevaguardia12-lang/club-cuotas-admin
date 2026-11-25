import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, createSheetsMock } from "./runtime.mjs";

const actor = { id: "admin", name: "Admin", role: "admin" };
const input = {
  requestId: "12345678-1234-4123-8123-123456789abc",
  userIds: ["ana", "bea", "ana"],
  title: "Hola {{nombre}}",
  message: "{{nombre_completo}} · {{apellido}} · {{usuario}}",
};
const accounts = [
  { userId: "ana", username: "anita", name: "Ana Pérez", role: "player", playerId: "p1" },
  { userId: "bea", username: "bea", name: "Bea de la Cruz", role: "coach" },
  { userId: "other", username: "otro", name: "Otro Usuario", role: "fan" },
];

function setup({
  storageFails = false,
  trackingFails = false,
  configured = true,
  failAllPushes = false,
} = {}) {
  const records = [],
    pushes = [],
    deleted = [];
  let finalizations = 0;
  const service = {
    async getAccountUsers() {
      return accounts;
    },
    async getNotifications() {
      return records;
    },
    async getPushSubscriptions() {
      return [
        { id: "ana-device", active: true, userId: "ana", endpoint: "ana" },
        { id: "expired", active: true, userId: "ana", endpoint: "expired" },
        { id: "inactive", active: false, userId: "bea", endpoint: "inactive" },
        { id: "other", active: true, userId: "other", endpoint: "other" },
      ];
    },
    async createNotifications(inputs) {
      if (storageFails) throw new Error("Storage unavailable");
      records.push(...inputs.map((item) => ({ ...item, status: "unread" })));
    },
    async updateNotificationDeliveries(updates) {
      if (trackingFails) throw new Error("Tracking unavailable");
      for (const update of updates)
        Object.assign(
          records.find((record) => record.referenceId === update.referenceId),
          update,
        );
      finalizations++;
    },
    async deletePushSubscription(endpoint, userId) {
      deleted.push({ endpoint, userId });
    },
    async recordAuditEvent() {},
  };
  const runtime = createRuntime({
    mocks: {
      "@/lib/push": {
        isPushConfigured: () => configured,
        sendPushNotification: async (device, payload) => {
          assert.equal(records.length, 2, "the inbox is durable before any push");
          pushes.push({ device, payload });
          if (device.endpoint === "expired" || failAllPushes) throw { statusCode: 410 };
        },
      },
    },
  });
  return {
    runtime,
    service,
    records,
    pushes,
    deleted,
    get finalizations() {
      return finalizations;
    },
    send: runtime.load("lib/manual-notifications.ts").sendManualNotifications,
  };
}

test("manual templates personalize title and message, reject unsupported variables and require recipients", () => {
  const { manualNotificationSchema, renderNotificationTemplate } = createRuntime().load(
    "lib/manual-notification-template.ts",
  );
  assert.equal(
    renderNotificationTemplate(input.message, accounts[1]),
    "Bea de la Cruz · de la Cruz · bea",
  );
  assert.equal(
    renderNotificationTemplate("{{nombre}} {{apellido}}", { name: "", username: "fan" }),
    "fan ",
  );
  for (const payload of [
    { ...input, title: "{{correo}}" },
    { ...input, message: "{{nombre}" },
    { ...input, userIds: [] },
    { ...input, title: " " },
  ])
    assert.equal(manualNotificationSchema.safeParse(payload).success, false);
});

test("selected users get separate personalized inbox records, no-device users keep their notice, and retries do not resend", async () => {
  const x = setup();
  const result = await x.send(input, x.service, actor);
  assert.equal(result.created, 2);
  assert.equal(result.pushSent, 1);
  assert.equal(result.noDevice, 1);
  assert.equal(result.pushFailed, 0);
  assert.deepEqual(
    x.records.map((record) => record.targetUserId),
    ["ana", "bea"],
  );
  assert.equal(x.records[0].title, "Hola Ana");
  assert.equal(
    x.records[0].targetPlayerId,
    undefined,
    "another account sharing a player must not receive this notice",
  );
  assert.equal(x.records[1].status, "unread");
  assert.equal(x.records[1].deliveryStatus, "no_subscription");
  assert.equal(x.pushes.length, 2);
  assert.deepEqual(x.deleted, [{ endpoint: "expired", userId: "ana" }]);
  const retried = await x.send(input, x.service, actor);
  assert.equal(retried.alreadyCreated, 2);
  assert.equal(x.records.length, 2);
  assert.equal(x.pushes.length, 2);
});

test("invalid recipients or storage failure send no push; tracking failure preserves durable inbox without duplicates", async () => {
  const invalid = setup();
  await assert.rejects(
    invalid.send({ ...input, userIds: ["unknown"] }, invalid.service, actor),
  );
  assert.equal(invalid.records.length, 0);
  assert.equal(invalid.pushes.length, 0);
  const unavailable = setup({ storageFails: true });
  await assert.rejects(unavailable.send(input, unavailable.service, actor));
  assert.equal(unavailable.pushes.length, 0);
  const tracking = setup({ trackingFails: true });
  assert.equal(
    (await tracking.send(input, tracking.service, actor)).deliveryTrackingFailed,
    true,
  );
  assert.equal(tracking.records.length, 2);
  await tracking.send(input, tracking.service, actor);
  assert.equal(tracking.pushes.length, 2);
});

test("only an administrator can create a manual notification and validation precedes any delivery", async () => {
  let role = "player",
    sends = 0;
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": {
        getCurrentUser: async () => (role ? { ...actor, role } : null),
      },
      "@/services/data-service": { getDataService: () => ({}) },
      "@/lib/manual-notifications": {
        sendManualNotifications: async () => {
          sends++;
          return { created: 2 };
        },
      },
    },
  });
  const { createManualNotificationAction } = runtime.load(
    "app/(dashboard)/notifications/actions.ts",
  );
  for (const forbidden of [null, "player", "coach", "fan", "treasurer"]) {
    role = forbidden;
    assert.ok((await createManualNotificationAction(input)).error);
  }
  role = "admin";
  assert.ok(
    (await createManualNotificationAction({ ...input, title: "{{nope}}" })).error,
  );
  assert.equal(sends, 0);
  assert.equal((await createManualNotificationAction(input)).ok, true);
  assert.equal(sends, 1);
});

test("notification history and read actions keep manual notices private even for admins or accounts sharing the same player", async () => {
  let user = {
    id: "ana",
    role: "player",
    playerId: "shared",
    username: "ana",
    name: "Ana Pérez",
  };
  const records = [
    {
      id: "mine",
      referenceId: "manual:request:ana",
      targetUserId: "ana",
      targetRole: "player",
      status: "unread",
      title: "Mine",
    },
    {
      id: "admin",
      referenceId: "manual:request:admin",
      targetUserId: "admin",
      targetRole: "admin",
      status: "unread",
      title: "Admin",
    },
    {
      id: "shared",
      referenceId: "manual:request:shared",
      targetUserId: "another",
      targetPlayerId: "shared",
      targetRole: "player",
      status: "unread",
      title: "Other",
    },
    { id: "system", targetRole: "admin", status: "unread", title: "System" },
  ];
  const read = [];
  const runtime = createRuntime({
    mocks: {
      "@/lib/auth/session": { getCurrentUser: async () => user },
      "@/services/data-service": {
        getDataService: () => ({
          getNotifications: async () => records,
          markNotificationsRead: async (ids) => read.push(...ids),
          recordAuditEvent: async () => {},
        }),
      },
    },
  });
  const route = runtime.load("app/api/notifications/route.ts");
  assert.deepEqual(
    (await (await route.GET()).json()).notifications.map((item) => item.id),
    ["mine"],
  );
  user = { id: "admin", username: "admin", role: "admin", name: "Admin" };
  assert.deepEqual(
    (await (await route.GET()).json()).notifications.map((item) => item.id),
    ["admin"],
  );
  assert.equal(
    (
      await route.PATCH(
        new Request("https://test/api/notifications", {
          method: "PATCH",
          body: JSON.stringify({ notificationId: "mine" }),
        }),
      )
    ).status,
    404,
  );
  await route.PATCH(
    new Request("https://test/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ markAll: true }),
    }),
  );
  assert.deepEqual(read, ["admin"]);
});

test("bulk creation uses one append and delivery updates preserve message, recipient and read status", async () => {
  const sheets = createSheetsMock({ Notificaciones: [] });
  const runtime = createRuntime({ mocks: { googleapis: sheets.googleapis } });
  const { GoogleSheetsService } = runtime.load("services/GoogleSheetsService.ts");
  const service = new GoogleSheetsService({
    spreadsheetId: "app",
    clientEmail: "test@example.com",
    privateKey: "TEST",
  });
  await service.createNotifications([
    {
      title: "=Aviso",
      message: "Hola Ana",
      targetUserId: "ana",
      referenceId: "manual:one:ana",
    },
    {
      title: "Segundo",
      message: "Hola Bea",
      targetUserId: "bea",
      referenceId: "manual:one:bea",
    },
  ]);
  assert.equal(sheets.rows.Notificaciones.length, 3);
  assert.equal(sheets.calls.writes, 2, "one header write and one bulk append");
  const headers = sheets.rows.Notificaciones[0];
  const before = structuredClone(sheets.rows.Notificaciones[1]);
  await service.updateNotificationDeliveries([
    { referenceId: "manual:one:ana", deliveryStatus: "sent", deliveryAttempts: 2 },
  ]);
  const after = sheets.rows.Notificaciones[1];
  for (const field of ["title", "message", "target_user_id", "status"])
    assert.equal(after[headers.indexOf(field)], before[headers.indexOf(field)]);
  assert.equal(after[headers.indexOf("delivery_status")], "sent");
  assert.equal(after[headers.indexOf("delivery_attempts")], "2");
  assert.equal(
    sheets.rows.Notificaciones[2][headers.indexOf("delivery_status")],
    "created",
  );
});

test("failed or unconfigured push keeps the targeted inbox unread and reports the delivery failure", async () => {
  for (const options of [{ configured: false }, { failAllPushes: true }]) {
    const x = setup(options);
    const result = await x.send(input, x.service, actor);
    assert.equal(result.created, 2);
    assert.equal(result.pushSent, 0);
    assert.equal(result.pushFailed, 1);
    assert.equal(result.noDevice, 1);
    assert.equal(x.records[0].deliveryStatus, "failed");
    assert.equal(x.records[0].status, "unread");
  }
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { administrationApi } from "../src/modules/administration/api/administrationApi";
import { infractionsApi } from "../src/modules/infractions/api/infractionsApi";
import { appealsApi } from "../src/modules/appeals/api/appealsApi";
import { publicApi } from "../src/modules/public-portal/api/publicApi";
import { paymentsApi } from "../src/modules/payments/api/paymentsApi";
import { solvenciesApi } from "../src/modules/solvencies/api/solvenciesApi";
import { HttpClientError } from "../src/services/httpClient";
import { analyticsApi } from "../src/modules/analytics/api/analyticsApi";
import { notificationsApi } from "../src/modules/notifications/api/notificationsApi";
import { addDecimal } from "../src/modules/dashboard/DashboardPage";
import { historicalMigrationsApi } from "../src/modules/historical-migrations/api/historicalMigrationsApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clientes de la API real", () => {
  it("suma importes positivos y negativos sin aritmética de punto flotante", () => {
    expect(addDecimal("150.00", "-0.50")).toBe("149.50");
    expect(addDecimal("0.00", "-0.50")).toBe("-0.50");
  });

  it("envía filtros y paginación de administración a /api/v1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [],
      meta: { page: 2, pageSize: 25, total: 0, requestId: "request-test" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await administrationApi.users.list({ search: "ana", status: "ACTIVE", page: 2, pageSize: 25 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/users?");
    expect(url).toContain("search=ana");
    expect(url).toContain("status=ACTIVE");
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=25");
    expect(options.credentials).toBe("include");
  });

  it("conserva código, estado y requestId en conflictos 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "USER_DUPLICATE", message: "El usuario ya existe." },
      meta: { requestId: "request-conflict" },
    }), { status: 409, headers: { "content-type": "application/json" } })));

    await expect(administrationApi.users.create({})).rejects.toEqual(expect.objectContaining({
      name: "HttpClientError",
      code: "USER_DUPLICATE",
      status: 409,
      requestId: "request-conflict",
    } satisfies Partial<HttpClientError>));
  });

  it("normaliza respuestas vacías del proxy sin exponer errores técnicos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));

    await expect(administrationApi.users.list()).rejects.toEqual(expect.objectContaining({
      name: "HttpClientError",
      code: "HTTP_502",
      status: 502,
      message: "No se pudo completar la solicitud.",
    } satisfies Partial<HttpClientError>));
  });

  it("adjunta evidencia como binario privado con metadatos controlados", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "7", checksum: "a".repeat(64), sizeBytes: 8 },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "evidence.png", { type: "image/png" });

    await infractionsApi.upload("9", file, "PHOTO", "3");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toContain("/api/v1/infractions/9/evidence");
    expect(options.body).toBe(file);
    expect(headers.get("content-type")).toBe("image/png");
    expect(headers.get("x-file-name")).toBe("evidence.png");
    expect(headers.get("x-device-id")).toBe("3");
  });

  it("registra una impugnación y conserva el identificador real de la infracción", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "21", appealNumber: "APL-00021" },
      meta: { requestId: "appeal-request" },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await appealsApi.create({ infractionId: 9, appellantName: "Persona interesada", reason: "Revisión formal", description: "Descripción suficiente para el expediente." });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/appeals");
    expect(JSON.parse(String(options.body))).toMatchObject({ infractionId: 9, reason: "Revisión formal" });
  });

  it("consulta públicamente solo con boleta y placa", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { reference: "a".repeat(40), ticketNumber: "BOLETA", plate: "PLACA" },
      meta: { requestId: "public-request" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await publicApi.search("BOLETA", "PLACA");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ ticketNumber: "BOLETA", plate: "PLACA" });
    expect(options.credentials).toBe("include");
  });

  it("envía idempotencia al crear una orden sin convertirla en pago", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { reference: "b".repeat(40), status: "ISSUED", notice: "No es recibo." },
      meta: { requestId: "order-request", idempotentReplay: false },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await publicApi.createOrder("a".repeat(40), "fixed-idempotency-key");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/public/payment-orders");
    expect(new Headers(options.headers).get("idempotency-key")).toBe("fixed-idempotency-key");
    expect(String(options.body)).not.toContain("paymentMethod");
  });

  it("crea un checkout de tarjeta o enlace Visa sin enviar datos de tarjeta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { reference: "d".repeat(40), paymentMethod: "VISA_LINK", status: "PENDING", checkoutUrl: "https://gateway.example/checkout" },
      meta: { requestId: "intent-request", idempotentReplay: false },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await publicApi.createPaymentIntent("b".repeat(40), "VISA_LINK", "intent-idempotency-key");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/public/payment-intents");
    expect(new Headers(options.headers).get("idempotency-key")).toBe("intent-idempotency-key");
    expect(JSON.parse(String(options.body))).toEqual({ paymentOrderReference: "b".repeat(40), paymentMethod: "VISA_LINK" });
    expect(String(options.body)).not.toMatch(/card|cvv|pan|number/i);
  });

  it("registra un pago real contra una orden con idempotencia", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "91", status: "REGISTERED", amount: "150.00" },
      meta: { requestId: "payment-request", idempotentReplay: false },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await paymentsApi.create({ paymentOrderId: 14, paymentMethodId: 3, amount: "150.00" });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/payments");
    expect(new Headers(options.headers).get("idempotency-key")).toBeTruthy();
    expect(JSON.parse(String(options.body))).toEqual({ paymentOrderId: 14, paymentMethodId: 3, amount: "150.00" });
  });

  it("verifica públicamente una solvencia sin enviar credenciales privadas", async () => {
    const reference = "c".repeat(40);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { solvencyNumber: "SOL-2026-000001", publicReference: reference, status: "VALID", valid: true },
      meta: { requestId: "solvency-request" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await solvenciesApi.verify(reference);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/v1/public/solvencies/${reference}/verify`);
    expect(options.method ?? "GET").toBe("GET");
    expect(options.body).toBeUndefined();
  });

  it("registra la solicitud interna de solvencia contra un vehículo real", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: 17, request_number: "SOL-REQ-2026-000017", status: "PENDING_REVIEW" },
      meta: { requestId: "solvency-create" },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await solvenciesApi.createRequest(29);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/solvencies/requests");
    expect(JSON.parse(String(options.body))).toEqual({ vehicleId: 29 });
  });

  it("envía el mismo rango y dependencia al dashboard real", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { departments: [], kpis: {}, charts: {} } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await analyticsApi.dashboard(new URLSearchParams({ from: "2026-09-01", to: "2026-09-11", departmentId: "4" }));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/v1/dashboard?"); expect(url).toContain("departmentId=4");
  });

  it("marca una notificación individual y todas mediante la API real", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await notificationsApi.read(17); await notificationsApi.readAll();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/notifications/17/read");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("PATCH");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/v1/notifications/read-all");
  });

  it("carga migración como CSV privado y exige confirmación separada", async () => {
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({data:{batch:{id:31,status:"UPLOADED"},idempotentReplay:false},meta:{requestId:"migration-upload"}}),{status:201,headers:{"content-type":"application/json"}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data:{},meta:{requestId:"migration-import"}}),{status:200,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);const file=new File(["legacy_id,status\nDEMO-1,ACTIVE\n"],"citizens.csv",{type:"text/csv"});await historicalMigrationsApi.upload(file,"citizens","ACCESS_TEST");await historicalMigrationsApi.importBatch(31,"IMPORTAR 00000000-0000-4000-8000-000000000031");
    const [uploadUrl,uploadOptions]=fetchMock.mock.calls[0] as [string,RequestInit];const headers=new Headers(uploadOptions.headers);expect(uploadUrl).toContain("/api/v1/admin/historical-migrations/uploads");expect(uploadOptions.body).toBe(file);expect(headers.get("x-file-name")).toBe("citizens.csv");expect(headers.get("x-source-system")).toBe("ACCESS_TEST");expect(headers.get("x-migration-entity")).toBe("citizens");expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({confirmation:"IMPORTAR 00000000-0000-4000-8000-000000000031"});
  });
});

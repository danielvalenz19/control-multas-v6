export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(
  /\/$/,
  "",
);

export class HttpClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId: string | null,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpClientError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  handleUnauthorized?: boolean;
};

export async function httpRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const isBinary =
    options.body instanceof Blob || options.body instanceof ArrayBuffer;
  const requestBody: BodyInit | undefined =
    options.body === undefined
      ? undefined
      : isFormData || isBinary
        ? (options.body as BodyInit)
        : (JSON.stringify(options.body) ?? undefined);
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !isFormData && !isBinary)
    headers.set("content-type", "application/json");
  headers.set("accept", "application/json");
  const response = await fetch(
    `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`,
    {
      ...options,
      credentials: "include",
      headers,
      body: requestBody,
    },
  );
  if (response.status === 204) return undefined as T;
  const payload = await parsePayload(response);
  if (!response.ok) {
    const error = (payload && typeof payload === "object" ? payload : {}) as {
      error?: { code?: string; message?: string; details?: unknown };
      meta?: { requestId?: string };
    };
    if (response.status === 401 && options.handleUnauthorized !== false) {
      window.dispatchEvent(new CustomEvent("pmt:unauthorized"));
    }
    throw new HttpClientError(
      error.error?.code ?? `HTTP_${response.status}`,
      error.error?.message ?? statusMessage(response.status),
      response.status,
      error.meta?.requestId ?? response.headers.get("x-request-id"),
      error.error?.details,
    );
  }
  return payload as T;
}

async function parsePayload(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { data: text } : undefined;
}

function statusMessage(status: number): string {
  const messages: Record<number, string> = {
    400: "La solicitud no es válida.",
    401: "La sesión no está disponible.",
    403: "No tienes permiso para esta acción.",
    404: "El recurso no existe.",
    409: "El registro entra en conflicto con otro existente.",
    422: "Los datos no pudieron procesarse.",
    429: "Demasiadas solicitudes. Intenta más tarde.",
    500: "El servidor no pudo completar la operación.",
  };
  return messages[status] ?? "No se pudo completar la solicitud.";
}

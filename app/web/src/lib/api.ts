import { getCsrfToken, isUnsafeMethod } from "../features/auth/csrf";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const method = init?.method || "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (isUnsafeMethod(method)) {
    const token = getCsrfToken();
    if (token) {
      headers["X-CSRF-Token"] = token;
    }
  }

  const response = await fetch(input, {
    ...init,
    method,
    credentials: "same-origin",
    headers,
  });

  const text = await response.text();

  if (!response.ok) {
    const parsed = parseErrorBody(text);
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("mediavault:unauthorized"));
    }
    throw new ApiError(
      parsed.error || response.statusText || "Request failed",
      response.status,
      parsed.code,
    );
  }

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON but received: ${text.slice(0, 200)}`);
  }
}

function parseErrorBody(text: string): { error?: string; code?: string } {
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as { error?: string; code?: string };
    return parsed && typeof parsed === "object" ? parsed : { error: text };
  } catch {
    return { error: text.slice(0, 200) };
  }
}

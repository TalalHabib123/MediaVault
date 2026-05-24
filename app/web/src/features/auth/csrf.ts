let csrfToken = "";

export function getCsrfToken() {
  return csrfToken;
}

export function setCsrfToken(nextToken: string) {
  csrfToken = nextToken;
}

export function clearCsrfToken() {
  csrfToken = "";
}

export function isUnsafeMethod(method: string | undefined) {
  const normalized = (method || "GET").toUpperCase();
  return (
    normalized === "POST" ||
    normalized === "PUT" ||
    normalized === "PATCH" ||
    normalized === "DELETE"
  );
}

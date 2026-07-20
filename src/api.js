// Thin sync layer: the server is the source of truth when reachable,
// localStorage keeps the app fully functional offline.

async function authRequest(path, username, password) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body; // { token, username }
}

export const login = (u, p) => authRequest("/api/login", u, p);
export const register = (u, p) => authRequest("/api/register", u, p);

export function logout(token) {
  fetch("/api/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

export async function fetchState(token, onExpired) {
  try {
    const res = await fetch("/api/state", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      onExpired?.();
      return null;
    }
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    return null;
  }
}

let timer = null;
let pending = {};
let pendingToken = null;

export function pushState(token, partial) {
  if (pendingToken !== token) {
    pending = {};
    pendingToken = token;
  }
  pending = { ...pending, ...partial };
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const body = pending;
    pending = {};
    try {
      await fetch("/api/state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      // offline — localStorage still has it; it'll sync on next change/load
    }
  }, 400);
}

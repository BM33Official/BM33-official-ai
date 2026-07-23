"use client";
// helper เรียก endpoint /admin/api/action
export async function act(action: string, payload: Record<string, unknown> = {}) {
  const r = await fetch("/admin/api/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  return r.json() as Promise<{ ok: boolean; error?: string; [k: string]: unknown }>;
}

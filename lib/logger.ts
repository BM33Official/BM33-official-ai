// Structured logging — พ่น 1 บรรทัด/เหตุการณ์ เป็น JSON
// Vercel > Logs ค้นหา/กรองตาม field ได้ง่าย (เช่น event:"gemini_reply" หรือ level:"error")

export type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

function emit(level: LogLevel, event: string, ctx?: LogContext): void {
  const line = { ts: new Date().toISOString(), level, event, ...ctx };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const log = {
  info: (event: string, ctx?: LogContext) => emit("info", event, ctx),
  warn: (event: string, ctx?: LogContext) => emit("warn", event, ctx),
  error: (event: string, ctx?: LogContext) => emit("error", event, ctx),
};

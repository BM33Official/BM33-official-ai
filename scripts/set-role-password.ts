// ตั้งรหัสผ่านบทบาทใหม่ (academic/finance) — เก็บเฉพาะ hash ในชีต, รหัสจริงเขียนไฟล์ *.secret.local (git-ignored)
import "./_env";
import { writeFileSync } from "fs";
import { setConfig, hashPassword, randomPassword } from "@/lib/bc/config";
(async () => {
  const role = process.argv[2] as "academic" | "finance";
  if (!["academic", "finance"].includes(role)) throw new Error("role = academic | finance");
  const pw = process.argv[3] || randomPassword(role === "academic" ? "bm33-aca" : "bm33-fin");
  await setConfig(`${role}_password_hash`, hashPassword(pw), "set via scripts/set-role-password.ts");
  writeFileSync(`${role}-password.secret.local`, pw + "\n");
  console.log(role, "password saved to", `${role}-password.secret.local`);
})();

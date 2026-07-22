// อัปเดต GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY ใน .env.local
// จากไฟล์ JSON ที่ดาวน์โหลดมา — ไม่พิมพ์ private key ออกจอ (กันหลุด)
//
// ใช้:  npm run set:creds                      (หาไฟล์ JSON ล่าสุดใน ~/Downloads ให้เอง)
//   หรือ: npm run set:creds -- /path/to/key.json
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

function findJson() {
  const arg = process.argv[2];
  if (arg) return resolve(arg);
  const dir = join(homedir(), "Downloads");
  const cands = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(dir, f))
    .filter((p) => {
      try {
        const j = JSON.parse(readFileSync(p, "utf8"));
        return j.type === "service_account" && j.private_key && j.client_email;
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!cands.length) throw new Error("ไม่พบไฟล์ service-account JSON ใน ~/Downloads — ระบุ path เอง");
  return cands[0];
}

const path = findJson();
const j = JSON.parse(readFileSync(path, "utf8"));
const email = j.client_email;
const keyLine = `GOOGLE_PRIVATE_KEY=${JSON.stringify(j.private_key)}`; // quoted + \n escaped

const envPath = resolve(process.cwd(), ".env.local");
let env = readFileSync(envPath, "utf8");

function setLine(name, line) {
  const re = new RegExp(`^${name}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : env + `\n${line}\n`;
}
setLine("GOOGLE_SERVICE_ACCOUNT_EMAIL", `GOOGLE_SERVICE_ACCOUNT_EMAIL=${email}`);
setLine("GOOGLE_PRIVATE_KEY", keyLine);
writeFileSync(envPath, env);

// เขียนค่า private key แบบพร้อมวางลง Vercel (ไม่มีเครื่องหมายคำพูดครอบ) ลงไฟล์ gitignore
const vercelFile = resolve(process.cwd(), "google-private-key.secret.local");
writeFileSync(vercelFile, j.private_key.replace(/\n/g, "\\n"));

console.log("✅ อัปเดต .env.local แล้วจาก:", path);
console.log("   email:", email);
console.log("   private key: (ไม่แสดง) ความยาว", j.private_key.length, "ตัวอักษร");
console.log("\n➡️  สำหรับ Vercel — ค่าพร้อมวางถูกเขียนไว้ที่ไฟล์:");
console.log("   google-private-key.secret.local  (เปิด, เลือกทั้งหมด, copy, วางในช่อง GOOGLE_PRIVATE_KEY ของ Vercel)");
console.log("   *** วางเสร็จแล้วลบไฟล์นี้ทิ้ง: rm google-private-key.secret.local ***");

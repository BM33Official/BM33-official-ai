// นำเข้าไฟล์ export แชต LINE: npx tsx scripts/import-line-chat.ts "<ไฟล์>" main|openchat
import "./_env";
import { readFileSync } from "fs";
import { importChatExport } from "@/lib/kb/import";
(async () => {
  const [file, source = "main"] = process.argv.slice(2);
  console.log(await importChatExport(readFileSync(file, "utf8"), source));
})();

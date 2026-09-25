import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "cesium", "Build", "Cesium");
const destination = join(root, "public", "cesium");
const assetFolders = ["Assets", "ThirdParty", "Widgets", "Workers"];

if (!existsSync(source)) {
  throw new Error("Cesium no está instalado. Ejecuta npm install antes de compilar.");
}

mkdirSync(destination, { recursive: true });
for (const folder of assetFolders) {
  const target = join(destination, folder);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(source, folder), target, { recursive: true });
}

console.log("Cesium runtime assets copied to public/cesium");

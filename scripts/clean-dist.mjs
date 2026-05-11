import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distPath = resolve(projectRoot, "dist");

if (!distPath.startsWith(projectRoot)) {
  throw new Error("Refusing to clean a path outside the project.");
}

await rm(distPath, { recursive: true, force: true });

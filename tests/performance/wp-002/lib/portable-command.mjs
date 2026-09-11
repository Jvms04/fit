import { extname } from "node:path";
import process from "node:process";

export function portableInvocation(executable, args) {
  return [".js", ".cjs", ".mjs"].includes(extname(executable).toLowerCase())
    ? { executable: process.execPath, args: [executable, ...args] }
    : { executable, args };
}

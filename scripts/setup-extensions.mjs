#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, copyFileSync, watch } from "fs";
import { join, relative } from "path";
import { homedir } from "os";

const examplesDir = join(import.meta.dirname, "..", "packages", "coding-agent", "examples", "extensions");
const dstDir = join(homedir(), ".pi", "agent", "extensions");
const EXTENSIONS = ["memory.ts"];

function deploy() {
	if (!existsSync(homedir() + "/.pi/agent")) {
		mkdirSync(homedir() + "/.pi/agent", { recursive: true });
	}
	if (!existsSync(dstDir)) {
		mkdirSync(dstDir, { recursive: true });
	}

	for (const name of EXTENSIONS) {
		const src = join(examplesDir, name);
		const dst = join(dstDir, name);
		copyFileSync(src, dst);
		console.log(`  ${name} -> ${dst}`);
	}
}

if (process.argv.includes("--watch")) {
	deploy();
	console.log("\n  Watching for changes... (Ctrl+C to stop)\n");
	for (const name of EXTENSIONS) {
		const src = join(examplesDir, name);
		watch(src, () => {
			try {
				copyFileSync(src, join(dstDir, name));
				console.log(`  [${new Date().toLocaleTimeString()}] ${name} synced`);
			} catch (e) {
				console.error(`  Sync failed for ${name}: ${e.message}`);
			}
		});
	}
} else {
	deploy();
	console.log("");
	console.log("  Run \`npm run setup-extensions -- --watch\` for auto-sync on file changes.");
}

process.on("SIGINT", () => process.exit(0));

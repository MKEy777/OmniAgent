#!/usr/bin/env node
import { existsSync, rmdirSync, unlinkSync, copyFileSync, mkdirSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const examplesDir = join(import.meta.dirname, "..", "packages", "coding-agent", "examples", "extensions");
const dstDir = join(homedir(), ".pi", "agent", "extensions");

async function main() {
	// Remove existing dst if it's a regular dir with a single file (from prior copy)
	if (existsSync(dstDir)) {
		const entries = readdirSync(dstDir);
		if (entries.length <= 1) {
			// Clean up old single-file deployment
			for (const e of entries) {
				try { unlinkSync(join(dstDir, e)); } catch { /* ignore */ }
			}
			try { rmdirSync(dstDir); } catch { /* ignore */ }
		} else {
			// Looks like user has their own extensions; don't touch
			console.log("  ~/.pi/agent/extensions/ already has multiple files; leaving as-is.");
			console.log("  Copy memory.ts individually:");
			copyFileSync(join(examplesDir, "memory.ts"), join(dstDir, "memory.ts"));
			console.log(`  memory.ts \u2192 ${join(dstDir, "memory.ts")} (copy)`);
			return;
		}
	}

	// Create directory junction/fallback
	if (!existsSync(homedir() + "/.pi/agent")) {
		mkdirSync(homedir() + "/.pi/agent", { recursive: true });
	}

	// Try junction/symlink first (works on Win without admin for directories)
	try {
		if (process.platform === "win32") {
			execSync(`powershell -Command "New-Item -ItemType Junction -Path '${dstDir}' -Target '${examplesDir}' -Force"`, {
				stdio: "pipe",
			});
		} else {
			execSync(`ln -sf '${examplesDir}' '${dstDir}'`, { stdio: "pipe" });
		}
		console.log(`  ~/.pi/agent/extensions/ -> ${examplesDir} (junction/symlink)`);
		console.log("");
		console.log("  All example extensions are now available globally.");
		console.log("  Changes to examples/extensions/* are reflected immediately.");
		return;
	} catch {
		// Fallback: single-file copy
		if (!existsSync(dstDir)) {
			mkdirSync(dstDir, { recursive: true });
		}
		copyFileSync(join(examplesDir, "memory.ts"), join(dstDir, "memory.ts"));
		console.log(`  memory.ts \u2192 ${dstDir} (copy)`);
		console.log("");
		console.log("  Tip: run \`npm run setup-extensions\` after any change to re-deploy.");
	}
}

await main();

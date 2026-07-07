import type { Component } from "@earendil-works/pi-tui";
import chalk from "chalk";
import { theme } from "../theme/theme.ts";
import { ASCII_HELLO, ASCII_TITLE_WIDTH, ASCII_YM, SHORTCUTS, TIPS } from "../welcome-config.ts";

export type BrandedHeaderMode = "hero" | "compact";

export class BrandedHeader implements Component {
	private mode: BrandedHeaderMode = "hero";
	private tipIndex = Math.floor(Math.random() * TIPS.length);

	setMode(mode: BrandedHeaderMode): void {
		this.mode = mode;
	}

	getMode(): BrandedHeaderMode {
		return this.mode;
	}

	rotateTip(): void {
		this.tipIndex = (this.tipIndex + 1) % TIPS.length;
	}

	invalidate(): void {
		// No cached state.
	}

	render(termWidth: number): string[] {
		if (this.mode === "compact") {
			return this.renderCompact(termWidth);
		}
		return this.renderHero(termWidth);
	}

	private renderHero(termWidth: number): string[] {
		const lines: string[] = ["", ""];
		const showAsciiArt = termWidth >= 60;

		if (showAsciiArt) {
			const titleGap = 4;
			const leftPad = Math.max(0, Math.floor((termWidth - ASCII_TITLE_WIDTH) / 2));
			const padStr = " ".repeat(leftPad);
			for (let i = 0; i < ASCII_HELLO.length; i++) {
				const helloSeg = ASCII_HELLO[i];
				const ymSeg = ASCII_YM[i];
				const purpleShade = interpolateColor("#A855F7", "#8B5CF6", i, ASCII_HELLO.length);
				const blueShade = interpolateColor("#3B82F6", "#2563EB", i, ASCII_YM.length);
				lines.push(
					padStr + chalk.hex(purpleShade).bold(helloSeg) + " ".repeat(titleGap) + chalk.hex(blueShade).bold(ymSeg),
				);
			}
		} else {
			lines.push(centerText(theme.bold(theme.fg("accent", "HELLO YM")), termWidth));
		}

		lines.push("");
		const tip = TIPS[this.tipIndex % TIPS.length];
		lines.push(centerText(this.formatTip(tip), termWidth));
		lines.push("");

		if (SHORTCUTS.length > 0) {
			const hintStr = SHORTCUTS.map((shortcut) => {
				return theme.fg("accent", shortcut.key) + theme.fg("muted", ` ${shortcut.desc}`);
			}).join("    ");
			lines.push(centerText(hintStr, termWidth));
		}

		lines.push("");
		return lines;
	}

	private renderCompact(termWidth: number): string[] {
		const colors = [
			chalk.hex("#3B82F6").bold,
			chalk.hex("#4B7BF5").bold,
			chalk.hex("#6374F3").bold,
			chalk.hex("#7B6DF2").bold,
			chalk.hex("#9366F0").bold,
			chalk.hex("#A85CF7").bold,
			chalk.hex("#B855F6").bold,
			chalk.hex("#C84EED").bold,
		];
		const chars = [
			colors[0]("H"),
			colors[1]("E"),
			colors[2]("L"),
			colors[3]("L"),
			colors[4]("O"),
			" ",
			colors[5]("Y"),
			colors[6]("M"),
			colors[7]("!"),
		];
		const leftPad = Math.max(0, Math.floor((termWidth - "HELLO YM!".length) / 2) - 1);
		return ["", " ".repeat(leftPad) + chars.join("")];
	}

	private formatTip(tip: string): string {
		const bullet = theme.fg("accent", "-");
		const label = theme.fg("accent", "Tip");
		const cmdMatch = tip.match(/(\/[\w:-]+|@file)/);
		if (!cmdMatch || cmdMatch.index === undefined) {
			return `${bullet} ${label} ${theme.fg("muted", tip)}`;
		}

		const command = cmdMatch[1];
		const beforeCommand = tip.slice(0, cmdMatch.index);
		const afterCommand = tip.slice(cmdMatch.index + command.length);
		const rest = theme.fg("muted", beforeCommand) + theme.fg("accent", command) + theme.fg("muted", afterCommand);
		return `${bullet} ${label} ${rest}`;
	}
}

function centerText(text: string, width: number): string {
	const textWidth = visibleWidthFast(text);
	const left = Math.max(0, Math.floor((width - textWidth) / 2));
	return " ".repeat(left) + text;
}

function visibleWidthFast(text: string): number {
	const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
	return plain.length;
}

function interpolateColor(from: string, to: string, index: number, max: number): string {
	if (max <= 1) return to;
	const t = index / (max - 1);
	const fr = parseInt(from.slice(1, 3), 16);
	const fg = parseInt(from.slice(3, 5), 16);
	const fb = parseInt(from.slice(5, 7), 16);
	const tr = parseInt(to.slice(1, 3), 16);
	const tg = parseInt(to.slice(3, 5), 16);
	const tb = parseInt(to.slice(5, 7), 16);

	const r = Math.round(fr + (tr - fr) * t);
	const g = Math.round(fg + (tg - fg) * t);
	const b = Math.round(fb + (tb - fb) * t);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

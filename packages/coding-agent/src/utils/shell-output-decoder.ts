/**
 * Decodes shell output as UTF-8, falling back to GB18030 for legacy Windows
 * code page output such as CP936/GBK.
 */

const LEGACY_WINDOWS_OUTPUT_ENCODING = "gb18030";
const EMPTY_BUFFER: Buffer = Buffer.alloc(0);

function getIncompleteUtf8SuffixLength(buffer: Buffer): number {
	if (buffer.length === 0) return 0;

	let leadIndex = buffer.length - 1;
	while (leadIndex >= 0 && (buffer[leadIndex] & 0xc0) === 0x80) {
		leadIndex--;
	}

	if (leadIndex < 0) {
		return Math.min(buffer.length, 4);
	}

	const lead = buffer[leadIndex];
	let expectedLength = 0;
	if ((lead & 0x80) === 0) {
		return 0;
	}
	if ((lead & 0xe0) === 0xc0) {
		expectedLength = 2;
	} else if ((lead & 0xf0) === 0xe0) {
		expectedLength = 3;
	} else if ((lead & 0xf8) === 0xf0) {
		expectedLength = 4;
	} else {
		return 0;
	}

	const actualLength = buffer.length - leadIndex;
	return actualLength < expectedLength ? actualLength : 0;
}

export class ShellOutputDecoder {
	private readonly utf8Decoder = new TextDecoder("utf-8", { fatal: true });
	private readonly fallbackDecoder = new TextDecoder(LEGACY_WINDOWS_OUTPUT_ENCODING);
	private usingFallback = false;
	private pendingUtf8Bytes: Buffer = EMPTY_BUFFER;

	decode(data: Buffer): string {
		if (this.usingFallback) {
			return this.fallbackDecoder.decode(data, { stream: true });
		}

		const replayBytes = this.pendingUtf8Bytes.length > 0 ? Buffer.concat([this.pendingUtf8Bytes, data]) : data;
		try {
			const text = this.utf8Decoder.decode(data, { stream: true });
			const suffixLength = getIncompleteUtf8SuffixLength(replayBytes);
			this.pendingUtf8Bytes =
				suffixLength > 0 ? replayBytes.subarray(replayBytes.length - suffixLength) : EMPTY_BUFFER;
			return text;
		} catch {
			this.usingFallback = true;
			this.pendingUtf8Bytes = EMPTY_BUFFER;
			return this.fallbackDecoder.decode(replayBytes, { stream: true });
		}
	}

	finish(): string {
		if (this.usingFallback) {
			return this.fallbackDecoder.decode();
		}

		try {
			const text = this.utf8Decoder.decode();
			this.pendingUtf8Bytes = EMPTY_BUFFER;
			return text;
		} catch {
			this.usingFallback = true;
			const text = this.fallbackDecoder.decode(this.pendingUtf8Bytes);
			this.pendingUtf8Bytes = EMPTY_BUFFER;
			return text;
		}
	}
}

# User Profile Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Pi extension that maintains an editable `profile.md` with partitioned injection into system prompt, AI-driven updates via `updateProfile` tool, and `/profile` slash commands.

**Architecture:** Single extension file (`user-profile.ts`) with exported pure functions for testability. `profile.md` stored at `~/.pi/agent/profile.md`. Extension hooks into `before_agent_start` (prompt injection), `session_shutdown` (end-of-session review trigger), registers `updateProfile` tool, and registers `/profile` command.

**Tech Stack:** TypeScript, Pi Extension API (`@earendil-works/pi-coding-agent`), TypeBox (`@earendil-works/pi-ai`), Vitest.

## Global Constraints

- File: `packages/coding-agent/examples/extensions/user-profile.ts`
- Test: `packages/coding-agent/test/extensions/user-profile.test.ts`
- Profile path: `os.homedir() + "/.pi/agent/profile.md"` — use `node:os` + `node:path`
- No in-memory cache of profile.md — read fresh on every access
- All pure logic functions exported as named exports for unit testing
- Default export is the extension factory function

---
### Task 1: Extension scaffold + profile.md management + parsing

**Files:**
- Create: `packages/coding-agent/examples/extensions/user-profile.ts`
- Create: `packages/coding-agent/test/extensions/user-profile.test.ts`

**Interfaces:**
- Consumes: `ExtensionAPI`, `Type` from packages
- Produces: `parseProfile(content: string): Profile | null`, `createDefaultProfile(): string`, `ensureProfileFile(fpath: string): Profile`, `classifySection(heading: string): "always" | "auto" | "ref"`

- [ ] **Step 1: Create the extension file skeleton with types**

Write the following to `packages/coding-agent/examples/extensions/user-profile.ts`:

```typescript
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Types ────────────────────────────────────────

export type SectionType = "always" | "auto" | "ref";

export interface ProfileSection {
  type: SectionType;
  heading: string;
  content: string;
  updatedAt: string; // ISO date string from heading comment
  raw: string; // original heading line including comment
}

export interface Profile {
  version: number;
  updatedAt: string;
  disabled: boolean;
  sections: ProfileSection[];
}

// ── Constants ────────────────────────────────────

const PROFILE_PATH = path.join(os.homedir(), ".pi", "agent", "profile.md");

const DEFAULT_TEMPLATE = `---
version: 1
updated_at: ${new Date().toISOString().slice(0, 10)}
disabled: false
---

## Identity
<!-- AI: append only -->
role:

## Communication Preferences
<!-- AI: append or upsert only -->

## Coding Preferences
<!-- AI: append or upsert only -->

## [auto] Projects

## [auto] Technical Interests

## [ref] Past Decisions
`;

// ── Section Classification ───────────────────────

export function classifySection(heading: string): SectionType {
  if (/^##\s*\[auto\]/i.test(heading)) return "auto";
  if (/^##\s*\[ref\]/i.test(heading)) return "ref";
  return "always";
}

// ── Profile Parsing ──────────────────────────────

export function parseProfile(content: string): Profile | null {
  try {
    const lines = content.split("\n");
    let i = 0;

    // Parse YAML frontmatter
    if (lines[i]?.trim() === "---") {
      i++;
      const frontmatterLines: string[] = [];
      while (i < lines.length && lines[i]?.trim() !== "---") {
        frontmatterLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ---
      const fm = Object.fromEntries(
        frontmatterLines
          .map(l => l.match(/^(\w+):\s*(.*)/))
          .filter(Boolean)
          .map(m => [m![1]!, m![2]!.trim()])
      );
      return {
        version: Number(fm.version) || 1,
        updatedAt: fm.updated_at || new Date().toISOString().slice(0, 10),
        disabled: fm.disabled === "true",
        sections: parseSections(lines.slice(i).join("\n")),
      };
    }

    return { version: 1, updatedAt: "", disabled: false, sections: parseSections(content) };
  } catch {
    return null;
  }
}

function parseSections(md: string): ProfileSection[] {
  const sections: ProfileSection[] = [];
  const headingRegex = /^##\s+(.+)$/gm;
  let lastIndex = 0;
  let lastHeading = "";
  let lastHeadingLine = "";
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(md)) !== null) {
    if (lastHeading) {
      const contentStart = lastIndex + match[0].length;
      // Wait - we need the content between headings
    }
    // Restructure: simpler approach
  }

  // Simpler split approach
  const lines = md.split("\n");
  let currentSection: Partial<ProfileSection> | null = null;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const hm = line.match(/^##\s+(.+)$/);
    if (hm) {
      if (currentSection && currentSection.heading) {
        sections.push(finalizeSection(currentSection));
      }
      const heading = hm[1]!;
      const updatedAtMatch = heading.match(/<!--\s*updated:\s*([\d-]+)\s*-->/);
      currentSection = {
        type: classifySection(heading),
        heading: heading.replace(/<!--[\s\S]*?-->/g, "").trim(),
        raw: heading,
        content: "",
        updatedAt: updatedAtMatch ? updatedAtMatch[1]! : new Date().toISOString().slice(0, 10),
      };
    } else if (currentSection) {
      currentSection.content += (currentSection.content ? "\n" : "") + line;
    }
  }
  if (currentSection && currentSection.heading) {
    sections.push(finalizeSection(currentSection));
  }
  return sections;
}

function finalizeSection(s: Partial<ProfileSection>): ProfileSection {
  return {
    type: s.type!,
    heading: s.heading!,
    content: s.content!.trim(),
    updatedAt: s.updatedAt!,
    raw: s.raw!,
  };
}
```

- [ ] **Step 2: Write parsing tests**

Add to `packages/coding-agent/test/extensions/user-profile.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { classifySection, parseProfile } from "../../examples/extensions/user-profile.ts";

describe("classifySection", () => {
  it("classifies bare headings as always", () => {
    expect(classifySection("## Identity")).toBe("always");
    expect(classifySection("## Coding Preferences")).toBe("always");
  });

  it("classifies [auto] headings", () => {
    expect(classifySection("## [auto] Projects")).toBe("auto");
  });

  it("classifies [ref] headings", () => {
    expect(classifySection("## [ref] Past Decisions")).toBe("ref");
  });
});

describe("parseProfile", () => {
  const sample = `---
version: 1
updated_at: 2026-07-06
disabled: false
---

## Identity
role: Engineer

## [auto] Projects
- Pi coding agent

## [ref] Decisions
- chose extension
`;

  it("parses frontmatter", () => {
    const p = parseProfile(sample);
    expect(p).not.toBeNull();
    expect(p!.version).toBe(1);
    expect(p!.disabled).toBe(false);
  });

  it("parses sections with correct types", () => {
    const p = parseProfile(sample)!;
    expect(p.sections).toHaveLength(3);
    expect(p.sections[0]!.type).toBe("always");
    expect(p.sections[0]!.heading).toBe("Identity");
    expect(p.sections[1]!.type).toBe("auto");
    expect(p.sections[1]!.heading).toBe("[auto] Projects");
    expect(p.sections[2]!.type).toBe("ref");
  });

  it("returns null on unparseable content", () => {
    expect(parseProfile("")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

Expected: TypeScript compilation error because extension file has incomplete `parseProfile`.

- [ ] **Step 4: Complete the parsing logic**

Replace the placeholder `parseSections` with the working version:

```typescript
function parseSections(md: string): ProfileSection[] {
  const sections: ProfileSection[] = [];
  const lines = md.split("\n");
  let current: Partial<ProfileSection> | null = null;

  for (const line of lines) {
    const hm = line.match(/^##\s+(.+)$/);
    if (hm) {
      if (current?.heading) {
        sections.push(finalizeSection(current));
      }
      const rawHeading = hm[1]!;
      const updatedAtMatch = rawHeading.match(/<!--\s*updated:\s*([\d-]+)\s*-->/);
      current = {
        type: classifySection(`## ${rawHeading}`),
        heading: rawHeading.replace(/<!--[\s\S]*?-->/g, "").trim(),
        raw: line,
        content: "",
        updatedAt: updatedAtMatch ? updatedAtMatch[1]! : new Date().toISOString().slice(0, 10),
      };
    } else if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
  }
  if (current?.heading) {
    sections.push(finalizeSection(current));
  }
  return sections;
}
```

Also ensure `DEFAULT_TEMPLATE` is exposed via a helper:

```typescript
export function createDefaultProfile(): string {
  return DEFAULT_TEMPLATE;
}
```

```typescript
export function ensureProfileFile(fpath: string): Profile {
  const dir = path.dirname(fpath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(fpath)) {
    fs.writeFileSync(fpath, DEFAULT_TEMPLATE, "utf-8");
  }
  const content = fs.readFileSync(fpath, "utf-8");
  return parseProfile(content) ?? parseProfile(DEFAULT_TEMPLATE)!;
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/coding-agent/examples/extensions/user-profile.ts packages/coding-agent/test/extensions/user-profile.test.ts
git commit -m "feat(coding-agent): add user profile extension scaffold with parsing"
```

---
### Task 2: System prompt injection with relevance scoring

**Files:**
- Modify: `packages/coding-agent/examples/extensions/user-profile.ts`
- Modify: `packages/coding-agent/test/extensions/user-profile.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ProfileSection` from Task 1
- Produces: `buildProfilePrompt(profile: Profile, userMessage: string): string`, `scoreSection(headingWords: string[], contentWords: string[], messageWords: Set<string>, updatedAt: string): number`, `extractKeywords(text: string): Set<string>`

- [ ] **Step 1: Write failing tests for scoring + prompt building**

Add to `user-profile.test.ts`:

```typescript
import { buildProfilePrompt, extractKeywords, scoreSection } from "../../examples/extensions/user-profile.ts";

describe("extractKeywords", () => {
  it("extracts meaningful keywords from text", () => {
    const words = extractKeywords("How should I design the Pi monorepo structure?");
    expect(words.has("design")).toBe(true);
    expect(words.has("monorepo")).toBe(true);
    expect(words.has("structure")).toBe(true);
    expect(words.has("the")).toBe(false); // stop word
  });
});

describe("scoreSection", () => {
  const now = new Date().toISOString().slice(0, 10);
  const oldDate = "2025-01-01";

  it("returns 0 when no match", () => {
    const msg = new Set(["react", "components"]);
    expect(scoreSection(["projects"], ["react"], msg, oldDate)).toBe(0);
  });

  it("gives +2 for heading match", () => {
    const msg = new Set(["projects"]);
    expect(scoreSection(["projects"], [], msg, oldDate)).toBe(2);
  });

  it("gives +1 for content match", () => {
    const msg = new Set(["react"]);
    expect(scoreSection(["projects"], ["react"], msg, oldDate)).toBe(1);
  });

  it("gives recency bonus when updated within 72h", () => {
    const msg = new Set(["projects"]);
    expect(scoreSection(["projects"], [], msg, now)).toBe(3); // 2 + 1 recency
  });
});

describe("buildProfilePrompt", () => {
  const profile = parseProfile(`---
version: 1
updated_at: 2026-07-06
disabled: false
---

## Identity
role: Engineer

## Communication Preferences
direct and concise

## [auto] Projects
- Pi coding agent

## [ref] Past Decisions
- chose extension
`)!;

  it("includes always sections", () => {
    const result = buildProfilePrompt(profile, "hello");
    expect(result).toContain("Identity");
    expect(result).toContain("Communication Preferences");
  });

  it("does not include ref sections content", () => {
    const result = buildProfilePrompt(profile, "hello");
    expect(result).not.toContain("Past Decisions");
  });

  it("includes ref section index", () => {
    const result = buildProfilePrompt(profile, "hello");
    expect(result).toContain("[ref] Past Decisions");
  });

  it("includes matched auto sections", () => {
    const result = buildProfilePrompt(profile, "how to structure the pi agent monorepo?");
    expect(result).toContain("[auto] Projects");
  });
});
```

- [ ] **Step 2: Run test to see failures**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

Expected: Fails — `buildProfilePrompt`, `extractKeywords`, `scoreSection` not defined.

- [ ] **Step 3: Implement keyword extraction + scoring**

Add to `user-profile.ts`:

```typescript
const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could",
  "should","may","might","shall","can","need","i","you","he",
  "she","it","we","they","my","your","his","her","its","our",
  "their","me","him","us","them","this","that","these","those",
  "in","on","at","by","with","from","to","for","of","about",
  "as","into","through","during","before","after","above","below",
  "between","out","off","over","under","again","further","then",
  "once","here","there","when","where","why","how","all","each",
  "every","both","few","more","most","other","some","such","no",
  "nor","not","only","own","same","so","than","too","very","just",
  "because","but","and","or","if","while","what","which","who","whom",
]);

export function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().split(/[\s,.;:!?()\[\]{}<>"'/\\|`~@#$%^&*\-=+]+/);
  const result = new Set<string>();
  for (const word of words) {
    if (word.length > 2 && !STOP_WORDS.has(word)) {
      result.add(word);
    }
  }
  return result;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s,.;:!?()\[\]{}<>"'/\\|`~@#$%^&*\-=+]+/).filter(w => w.length > 2);
}

export function scoreSection(
  headingWords: string[],
  contentWords: string[],
  messageWords: Set<string>,
  updatedAt: string,
): number {
  let score = 0;
  for (const w of headingWords) {
    if (messageWords.has(w)) score += 2;
  }
  for (const w of contentWords) {
    if (messageWords.has(w)) score += 1;
  }
  const hoursSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / 3_600_000;
  if (hoursSinceUpdate < 72) score += 1;
  return score;
}
```

- [ ] **Step 4: Implement buildProfilePrompt**

Add to `user-profile.ts`:

```typescript
const MAX_AUTO_SECTIONS = 3;

export function buildProfilePrompt(profile: Profile, userMessage: string): string {
  const result: string[] = [];
  const messageWords = extractKeywords(userMessage);

  // Always sections
  const alwaysSections = profile.sections.filter(s => s.type === "always");
  const autoSections = profile.sections.filter(s => s.type === "auto");
  const refSections = profile.sections.filter(s => s.type === "ref");

  // Score and sort auto sections
  const scored = autoSections.map(s => ({
    section: s,
    score: scoreSection(
      tokenize(s.heading),
      tokenize(s.content),
      messageWords,
      s.updatedAt,
    ),
  })).sort((a, b) => b.score - a.score);

  const selectedAuto = scored
    .filter(s => s.score >= 2)
    .slice(0, MAX_AUTO_SECTIONS)
    .map(s => s.section);

  result.push("<user_profile>");

  for (const s of alwaysSections) {
    result.push(s.content ? `[${s.heading}]\n${s.content}` : `[${s.heading}]`);
  }

  if (selectedAuto.length > 0) {
    result.push("");
    result.push("--- current context ---");
    for (const s of selectedAuto) {
      result.push(s.content ? `[${s.heading}]\n${s.content}` : `[${s.heading}]`);
    }
  }

  if (refSections.length > 0) {
    result.push("");
    result.push("--- available sections ---");
    for (const s of refSections) {
      result.push(`  [${s.heading}] (use \`/profile view --section "${s.heading.replace(/\[ref\]\s*/, "")}"\`)`);
    }
  }

  result.push("");
  result.push("Update the profile with updateProfile when you detect stable, long-term preferences, project facts, or communication patterns.");
  result.push("</user_profile>");

  return result.join("\n");
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Wire up `before_agent_start` hook in the extension factory**

Add at the end of `user-profile.ts` (replace the placeholder export default):

```typescript
export default function (pi: ExtensionAPI) {
  // Initialize profile file
  const profile = ensureProfileFile(PROFILE_PATH);
  if (profile.disabled) return;

  pi.on("before_agent_start", async (event) => {
    if (profile.disabled) return;
    const { systemPrompt, systemPromptOptions } = event;
    const userMessage = event.prompt ?? systemPromptOptions.cwd ?? "";
    const profilePrompt = buildProfilePrompt(profile, userMessage);
    return { systemPrompt: `${systemPrompt}\n${profilePrompt}` };
  });
}
```

Wait — the event type for `before_agent_start` might not have `prompt`. Let me check from the types again:

```typescript
export interface BeforeAgentStartEvent {
    type: "before_agent_start";
    prompt: string;
    images?: ImageContent[];
    systemPrompt: string;
    systemPromptOptions: BuildSystemPromptOptions;
}
```

It does have `prompt`. But what is `prompt`? Looking at the runner's emit:

```typescript
async emitBeforeAgentStart(
    prompt: string,
    images: ImageContent[] | undefined,
    systemPrompt: string,
    systemPromptOptions: BuildSystemPromptOptions,
): Promise<{ messages?: AgentMessage[]; systemPrompt?: string }>
```

So `event.prompt` is the user's input. Perfect.

But wait - there's a subtlety. The `before_agent_start` handler in the extension factory needs to be aware that the profile might have changed (user edited the file). Currently we read the profile once at load time and cache it. We should re-read on every trigger.

Let me adjust: read the file fresh inside the hook, not at init.

- [ ] **Step 7: Fix profile reading to be fresh on every hook call**

Update the `before_agent_start` handler:

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const content = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, "utf-8") : "";
    const profile = content ? parseProfile(content) : ensureProfileFile(PROFILE_PATH);
    if (!profile || profile.disabled) return;

    const userPrompt = event.prompt || "";
    const profilePrompt = buildProfilePrompt(profile, userPrompt);
    return { systemPrompt: `${event.systemPrompt}\n${profilePrompt}` };
  });
}
```

- [ ] **Step 8: Run full test suite to verify nothing broken**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add packages/coding-agent/examples/extensions/user-profile.ts packages/coding-agent/test/extensions/user-profile.test.ts
git commit -m "feat(coding-agent): add profile prompt injection with relevance scoring"
```

---
### Task 3: updateProfile tool with validation chain

**Files:**
- Modify: `packages/coding-agent/examples/extensions/user-profile.ts`
- Modify: `packages/coding-agent/test/extensions/user-profile.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ProfileSection` from Task 1
- Produces: `validateUpdate(profile: Profile, section: string, content: string, mode: string, reason: string): string | null`, `applyUpdate(profile: Profile, sectionName: string, content: string, mode: "append" | "upsert" | "replace"): Profile`, `writeProfile(fpath: string, profile: Profile): void`

- [ ] **Step 1: Write failing tests for validation**

Add to test file:

```typescript
import { validateUpdate, applyUpdate } from "../../examples/extensions/user-profile.ts";

describe("validateUpdate", () => {
  const profile = parseProfile(`---
version: 1
disabled: false
---

## Identity
role: Engineer

## [auto] Projects
- Pi coding agent
`)!;

  it("rejects empty reason", () => {
    const err = validateUpdate(profile, "Projects", "new content", "append", "");
    expect(err).not.toBeNull();
    expect(err).toContain("reason");
  });

  it("rejects replace on Identity", () => {
    const err = validateUpdate(profile, "Identity", "new role", "replace", "long-term change in role");
    expect(err).not.toBeNull();
    expect(err).toContain("Identity");
  });

  it("allows append on Identity", () => {
    const err = validateUpdate(profile, "Identity", "new info", "append", "additional role information");
    expect(err).toBeNull();
  });

  it("rejects content with API keys", () => {
    const err = validateUpdate(profile, "Projects", "secret: sk-abc123", "append", "project with key");
    expect(err).not.toBeNull();
    expect(err).toContain("sensitive");
  });

  it("rejects highly overlapping content", () => {
    const err = validateUpdate(profile, "Projects", "- Pi coding agent\nduplicate", "append", "adding related project");
    expect(err).not.toBeNull();
    expect(err).toContain("duplicate");
  });
});

describe("applyUpdate", () => {
  const baseProfile = parseProfile(`---
version: 1
disabled: false
---

## [auto] Projects
- existing project
`)!;

  it("appends content to section", () => {
    const updated = applyUpdate(baseProfile, "[auto] Projects", "- new project", "append");
    expect(updated.sections[0]!.content).toContain("- existing project");
    expect(updated.sections[0]!.content).toContain("- new project");
  });

  it("replaces content in replace mode", () => {
    const updated = applyUpdate(baseProfile, "[auto] Projects", "- replaced content", "replace");
    expect(updated.sections[0]!.content).toBe("- replaced content");
  });

  it("upserts key-value content", () => {
    const profile = parseProfile(`---
version: 1
disabled: false
---

## Coding Preferences
lang: TypeScript
`)!;
    const updated = applyUpdate(profile, "Coding Preferences", "lang: Rust", "upsert");
    expect(updated.sections[0]!.content).toContain("lang: Rust");
    expect(updated.sections[0]!.content).not.toContain("lang: TypeScript");
  });

  it("updates section timestamp on write", () => {
    const updated = applyUpdate(baseProfile, "[auto] Projects", "- new", "append");
    expect(updated.sections[0]!.updatedAt).toBe(new Date().toISOString().slice(0, 10));
  });
});
```

- [ ] **Step 2: Run to see failures**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

- [ ] **Step 3: Implement validation**

Add to `user-profile.ts`:

```typescript
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,          // OpenAI keys
  /api[-_]?key/i,
  /(password|passwd|secret)\s*[:=]/i,
  /-----BEGIN\s+(RSA|OPENSSH|PRIVATE)\s+KEY-----/,
];

export function validateUpdate(
  profile: Profile,
  sectionName: string,
  content: string,
  mode: string,
  reason: string,
): string | null {
  if (!reason || reason.length < 5) {
    return "reason is required and must be meaningful";
  }

  const section = profile.sections.find(
    s => s.heading.toLowerCase().includes(sectionName.toLowerCase()) ||
        s.heading.replace(/\[(auto|ref)\]\s*/i, "").trim().toLowerCase().includes(sectionName.toLowerCase()),
  );
  if (!section) return `section "${sectionName}" not found`;

  // Section allowlist
  if (section.type === "always") {
    if (section.heading === "Identity" && mode !== "append") {
      return "Identity section only allows append mode";
    }
    if (mode === "replace") return "always sections do not allow replace mode";
  }

  // Sensitive content check
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) return "content contains sensitive information";
  }

  // Deduplication
  if (mode === "append" || mode === "upsert") {
    const overlap = countOverlap(content, section.content);
    if (overlap > 0.6) return "content is largely duplicate of existing section content";
  }

  return null;
}

function countOverlap(newContent: string, existingContent: string): number {
  if (!existingContent) return 0;
  const newWords = new Set(newContent.toLowerCase().split(/\s+/));
  const existingWords = existingContent.toLowerCase().split(/\s+/);
  if (newWords.size === 0) return 0;
  let matches = 0;
  for (const w of existingWords) {
    if (newWords.has(w)) matches++;
  }
  return matches / existingWords.length;
}
```

- [ ] **Step 4: Implement applyUpdate + writeProfile**

Add to `user-profile.ts`:

```typescript
export function applyUpdate(
  profile: Profile,
  sectionName: string,
  content: string,
  mode: "append" | "upsert" | "replace",
): Profile {
  const today = new Date().toISOString().slice(0, 10);
  const updated = { ...profile, sections: profile.sections.map(s => {
    const match = s.heading.toLowerCase().includes(sectionName.toLowerCase()) ||
      s.heading.replace(/\[(auto|ref)\]\s*/i, "").trim().toLowerCase().includes(sectionName.toLowerCase());
    if (!match) return s;

    let newContent = s.content;
    if (mode === "replace") {
      newContent = content;
    } else if (mode === "append") {
      newContent = s.content ? s.content + "\n" + content : content;
    } else if (mode === "upsert") {
      newContent = upsertContent(s.content, content);
    }

    return { ...s, content: newContent, updatedAt: today };
  })};
  return updated;
}

function upsertContent(existing: string, newLines: string): string {
  const lines = existing.split("\n").filter(Boolean);
  const updates = newLines.split("\n").filter(Boolean);
  const updatedLines = [...lines];

  for (const update of updates) {
    const keyMatch = update.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
    if (!keyMatch) {
      updatedLines.push(update);
      continue;
    }
    const key = keyMatch[1]!;
    const idx = updatedLines.findIndex(l => l.startsWith(key + ":") || l.startsWith(key + " :"));
    if (idx >= 0) {
      updatedLines[idx] = update;
    } else {
      updatedLines.push(update);
    }
  }

  return updatedLines.join("\n");
}

export function serializeProfile(profile: Profile): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`version: ${profile.version}`);
  lines.push(`updated_at: ${profile.updatedAt}`);
  lines.push(`disabled: ${profile.disabled}`);
  lines.push("---");
  lines.push("");

  for (const section of profile.sections) {
    const ts = section.updatedAt;
    const heading = ts
      ? `${section.raw.includes("<!--") ? section.raw.replace(/<!--.*?-->/, `<!-- updated: ${ts} -->`) : section.raw + ` <!-- updated: ${ts} -->`}`
      : section.raw;
    lines.push(heading);
    if (section.content) {
      lines.push(section.content);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function writeProfile(fpath: string, profile: Profile): void {
  fs.writeFileSync(fpath, serializeProfile(profile), "utf-8");
}
```

- [ ] **Step 5: Register the tool in extension factory**

Add to the extension factory function:

```typescript
export default function (pi: ExtensionAPI) {
  // ── Tool: updateProfile ─────────────────
  pi.registerTool(defineTool({
    name: "updateProfile",
    label: "Update Profile",
    description: "Update the user profile with long-term preferences, project facts, or communication patterns observed during conversation. Validates content before writing.",
    parameters: Type.Object({
      section: Type.String({ description: "Section heading (e.g. 'Identity', '[auto] Projects', 'Coding Preferences')" }),
      content: Type.String({ description: "Content to write" }),
      mode: Type.Optional(Type.Union([
        Type.Literal("append"),
        Type.Literal("upsert"),
        Type.Literal("replace"),
      ])),
      reason: Type.String({ description: "Why this belongs in the long-term profile" }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const mode = params.mode ?? "append";
      const contentRaw = fs.readFileSync(PROFILE_PATH, "utf-8");
      const profile = parseProfile(contentRaw);
      if (!profile) {
        return { content: [{ type: "text", text: "Error: profile file is corrupted. Run `/profile edit` to fix it." }] };
      }

      const validationError = validateUpdate(profile, params.section, params.content, mode, params.reason);
      if (validationError) {
        return { content: [{ type: "text", text: `Validation failed: ${validationError}` }], isError: true };
      }

      const updated = applyUpdate(profile, params.section, params.content, mode as any);
      writeProfile(PROFILE_PATH, updated);
      return {
        content: [{ type: "text", text: `Profile section "${params.section}" updated (mode: ${mode}). Current content:\n${updated.sections.find(s => s.heading.toLowerCase().includes(params.section.toLowerCase()))?.content ?? ""}` }],
      };
    },
  }));

  // ── Hook: before_agent_start ────────────
  pi.on("before_agent_start", async (event) => {
    const content = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, "utf-8") : "";
    const profile = content ? parseProfile(content) : null;
    if (!profile || profile.disabled) return;

    const userPrompt = event.prompt || "";
    const profilePrompt = buildProfilePrompt(profile, userPrompt);
    return { systemPrompt: `${event.systemPrompt}\n${profilePrompt}` };
  });
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/coding-agent/examples/extensions/user-profile.ts packages/coding-agent/test/extensions/user-profile.test.ts
git commit -m "feat(coding-agent): add updateProfile tool with validation chain"
```

---
### Task 4: /profile command + lifecycle hooks

**Files:**
- Modify: `packages/coding-agent/examples/extensions/user-profile.ts`

**Interfaces:**
- Consumes: `Profile`, `writeProfile`, `buildProfilePrompt`, `parseProfile` from prior tasks
- Produces: `registerCommand("profile", ...)`, `session_shutdown` hook registration

- [ ] **Step 1: Implement `/profile` command with all subcommands**

Add to the extension factory:

```typescript
export default function (pi: ExtensionAPI) {
  // ... existing tool + hook registrations ...

  // ── Command: /profile ──────────────────
  pi.registerCommand("profile", {
    description: "View, edit, or update the user profile",
    getArgumentCompletions: (prefix) => {
      const cmds = ["view", "edit", "update", "sections", "enable", "disable"];
      return cmds.filter(c => c.startsWith(prefix)).map(v => ({ value: v, label: v }));
    },
    handler: async (args, ctx) => {
      const [subcommand, ...rest] = args.trim().split(/\s+/);
      const profileContent = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, "utf-8") : "";
      const profile = profileContent ? parseProfile(profileContent) : null;

      switch (subcommand) {
        case "view": {
          const sectionFilter = rest.join(" ").replace(/^--section\s*/i, "").trim();
          if (sectionFilter && profile) {
            const matched = profile.sections.filter(s =>
              s.heading.toLowerCase().includes(sectionFilter.toLowerCase())
            );
            if (matched.length === 0) {
              ctx.ui.notify(`No sections matching "${sectionFilter}"`, "info");
              return;
            }
            for (const s of matched) {
              ctx.ui.notify(`[${s.type}] ${s.heading}\n${s.content || "(empty)"}`, "info");
            }
          } else {
            ctx.ui.notify(profileContent || "Profile file not found. Run a conversation to create it.", "info");
          }
          break;
        }

        case "sections": {
          if (!profile) {
            ctx.ui.notify("No profile found", "info");
            return;
          }
          const lines = [
            `Profile: ${profile.disabled ? "disabled" : "enabled"}`,
            "",
          ];
          for (const s of profile.sections) {
            const typeLabel = s.type === "always" ? "[always]" : s.type === "auto" ? "[auto]  " : "[ref]   ";
            lines.push(`${typeLabel} ${s.heading.padEnd(35)} updated: ${s.updatedAt}`);
          }
          ctx.ui.notify(lines.join("\n"), "info");
          break;
        }

        case "edit": {
          ctx.ui.notify(`Profile file: ${PROFILE_PATH}\nEdit it directly with any text editor. Changes take effect on next interaction.`, "info");
          break;
        }

        case "update": {
          if (!profile) {
            ctx.ui.notify("No profile to update", "info");
            return;
          }
          pi.sendUserMessage(
            "Please review our conversation history and update the user profile " +
            "if you notice any meaningful preferences, habits, project context, " +
            "or communication patterns worth recording. Call the updateProfile tool if appropriate.",
            { deliverAs: "nextTurn" },
          );
          ctx.ui.notify("Update request queued for next interaction", "info");
          break;
        }

        case "enable":
        case "disable": {
          if (!profile) {
            ctx.ui.notify("No profile found", "info");
            return;
          }
          const newDisabled = subcommand === "disable";
          const updated = { ...profile, disabled: newDisabled };
          writeProfile(PROFILE_PATH, updated);
          ctx.ui.notify(`Profile ${newDisabled ? "disabled" : "enabled"}`, "info");
          break;
        }

        default: {
          ctx.ui.display(
            "Usage: /profile <subcommand>\n\n" +
            "  view                  Show full profile\n" +
            "  view --section <kw>   Show matching sections\n" +
            "  edit                  Show file path for manual editing\n" +
            "  update                Request AI to review and update profile\n" +
            "  sections              List all sections with timestamps\n" +
            "  enable                Enable profile injection\n" +
            "  disable               Disable profile injection",
          );
        }
      }
    },
  });

  // ── Hook: session_shutdown ─────────────
  pi.on("session_shutdown", async (_event, ctx) => {
    const content = fs.existsSync(PROFILE_PATH) ? fs.readFileSync(PROFILE_PATH, "utf-8") : "";
    if (!content) return;
    
    const sessionEntries = ctx.sessionManager.getEntries();
    const recentMessages = sessionEntries.filter(e => e.type === "message").length;
    // Only trigger if there were meaningful exchanges (at least 3 messages)
    if (recentMessages < 3) return;

    pi.sendUserMessage(
      "Session ended. Review the conversation for any long-term user preferences, " +
      "project context, or communication patterns worth recording, " +
      "and call updateProfile if appropriate.",
      { deliverAs: "nextTurn" },
    );
  });
}
```

- [ ] **Step 2: Run tests to verify existing tests still pass**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/coding-agent/examples/extensions/user-profile.ts
git commit -m "feat(coding-agent): add /profile command and session_shutdown hook"
```

---
### Task 5: Integration test + verification

**Files:**
- Modify: `packages/coding-agent/test/extensions/user-profile.test.ts`

- [ ] **Step 1: Write integration test using extension runner**

Add to test file:

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAndLoadExtensions } from "../../src/core/extensions/loader.ts";
import { ExtensionRunner } from "../../src/core/extensions/runner.ts";
import { SessionManager } from "../../src/core/session-manager.ts";
import { ModelRegistry } from "../../src/core/model-registry.ts";
import { AuthStorage } from "../../src/core/auth-storage.ts";

describe("user-profile extension integration", () => {
  let tempDir: string;
  let extensionsDir: string;
  let sessionManager: SessionManager;
  let modelRegistry: ModelRegistry;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-profile-test-"));
    extensionsDir = path.join(tempDir, "extensions");
    fs.mkdirSync(extensionsDir);
    sessionManager = SessionManager.inMemory();
    const authStorage = AuthStorage.create(path.join(tempDir, "auth.json"));
    modelRegistry = ModelRegistry.create(authStorage);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads and registers updateProfile tool", async () => {
    const extPath = path.join(extensionsDir, "profile.ts");
    // Copy the real extension file (relative resolution in test env)
    const realExt = fs.readFileSync(
      path.resolve("packages/coding-agent/examples/extensions/user-profile.ts"),
      "utf-8",
    );
    // Patch PROFILE_PATH to use temp dir
    const patched = realExt.replace(
      /const PROFILE_PATH = .*/,
      `const PROFILE_PATH = "${path.join(tempDir, "profile.md").replace(/\\/g, "\\\\")}"`,
    );
    fs.writeFileSync(extPath, patched, "utf-8");

    const result = await discoverAndLoadExtensions([extPath], tempDir);
    const runner = new ExtensionRunner(result.extensions, result.runtime, tempDir, sessionManager, modelRegistry);
    const tools = runner.getAllRegisteredTools();

    expect(tools.some(t => t.definition.name === "updateProfile")).toBe(true);
  });

  it("creates profile.md on first before_agent_start", async () => {
    const extPath = path.join(extensionsDir, "profile.ts");
    const profilePath = path.join(tempDir, "profile.md").replace(/\\/g, "\\\\");
    const realExt = fs.readFileSync(
      path.resolve("packages/coding-agent/examples/extensions/user-profile.ts"),
      "utf-8",
    );
    const patched = realExt.replace(
      /const PROFILE_PATH = .*/,
      `const PROFILE_PATH = "${profilePath}"`,
    );
    fs.writeFileSync(extPath, patched, "utf-8");

    const result = await discoverAndLoadExtensions([extPath], tempDir);
    const runner = new ExtensionRunner(result.extensions, result.runtime, tempDir, sessionManager, modelRegistry);
    runner.bindCore(
      { sendMessage: () => {}, sendUserMessage: () => {}, appendEntry: () => {},
        setSessionName: () => {}, getSessionName: () => undefined, setLabel: () => {},
        getActiveTools: () => [], getAllTools: () => [], setActiveTools: () => {},
        refreshTools: () => {}, getCommands: () => [], setModel: async () => false,
        getThinkingLevel: () => "off" as const, setThinkingLevel: () => {} },
      { getModel: () => undefined, isIdle: () => true, isProjectTrusted: () => true,
        getSignal: () => undefined, abort: () => {}, hasPendingMessages: () => false,
        shutdown: () => {}, getContextUsage: () => undefined, compact: () => {},
        getSystemPrompt: () => "" },
    );

    await runner.emitBeforeAgentStart("hello", undefined, "base system prompt", { cwd: tempDir });

    expect(fs.existsSync(path.join(tempDir, "profile.md"))).toBe(true);
    const content = fs.readFileSync(path.join(tempDir, "profile.md"), "utf-8");
    expect(content).toContain("## Identity");
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts
```

Expected: All unit tests + integration tests pass.

- [ ] **Step 3: Final verification — full test suite for the test file**

```bash
npx vitest run --reporter=verbose packages/coding-agent/test/extensions/user-profile.test.ts 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/coding-agent/test/extensions/user-profile.test.ts
git commit -m "test(coding-agent): add integration test for user-profile extension"
```

---
### Installation instructions (for reference)

After implementation, copy the extension to activate it:

```bash
cp packages/coding-agent/examples/extensions/user-profile.ts ~/.pi/agent/extensions/user-profile.ts
```

Or for project-local usage:

```bash
cp packages/coding-agent/examples/extensions/user-profile.ts .pi/extensions/user-profile.ts
```

The extension will:
1. Create `~/.pi/agent/profile.md` on first use with placeholder sections
2. Inject profile context into system prompt on every turn
3. Register `/profile` command for manual profile management
4. Register `updateProfile` tool for AI-driven profile updates
5. Queue end-of-session review prompts

Run `pi` and type `/profile sections` to verify it's loaded.

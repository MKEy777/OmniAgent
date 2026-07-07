# User Profile Extension — Design Spec

## Overview

A Pi extension that maintains a persistent `profile.md` — an editable user profile built through conversation and updated via AI + user control. Supports partitioned injection into system prompt, slash command management, and multi-tier update strategies.

---

## Motivation

Pi currently has no mechanism to remember user preferences, coding style, communication habits, or project context across sessions. Users must re-state preferences every session or maintain fragile AGENTS.md files. This extension adds persistent, structured, AI-maintainable user memory.

---

## File Layout

```
~/.pi/agent/
  extensions/
    user-profile.ts         # extension 入口 + 所有逻辑
  profile.md                 # 用户画像数据文件（用户可直接编辑）
```

`profile.md` is created automatically on first run with placeholder sections. The extension reads the file fresh on every access — no in-memory cache — so manual edits are always reflected immediately.

---

## Profile.md Format

YAML frontmatter + Markdown partitioned by heading. Heading prefixes encode injection type.

```markdown
---
version: 1
updated_at: 2026-07-06
disabled: false
---

## Identity
role: Research Engineer
primary_languages: TypeScript, Python

## Communication Preferences
prefer_brevity: true
prefer_examples: true

## Coding Preferences
style: concise, no comments
formatter: prettier

## [auto] Projects
updated_at: 2026-07-06
- Pi coding agent (monorepo)

## [auto] Technical Interests
updated_at: 2026-07-06
- LLM agent systems
- Compiler design

## [ref] Past Decisions
updated_at: 2026-06-30
- chose extension over core modification for profile
```

### Section Types

| Heading Prefix | Type | Injection | AI Write Access |
|---|---|---|---|
| `## <name>` (no prefix) | Always | always injected | append / upsert only (no replace for Identity) |
| `## [auto] <name>` | Auto | top-k matched by relevance | all modes |
| `## [ref] <name>` | Ref | not injected; exposed as index only | all modes |

Always sections carry implicit HTML comment annotations in the generated template to guide both user and AI:

```markdown
## Communication Preferences
<!-- AI: append or upsert lines only -->
prefer_brevity: true
```

### Auto Section Relevance Scoring

```
score(section, message):
  heading_hits = keyword_match(section.heading, message)         // +2 per hit
  content_hits = keyword_match(section.content, message)          // +1 per hit
  recency_bonus = hours_since_update(section.updated_at) < 72    // +1
  return heading_hits + content_hits + recency_bonus

inject = sorted(auto_sections, key=score, reverse=True)[:k]
```

`k` defaults to 3, adjusted down if token budget is tight, capped at 5.

---

## Extension Components

### 1. Initialization

```ts
export default function (pi: ExtensionAPI) {
  // 1a. ensure profile.md exists (create template if missing)
  // 1b. register updateProfile tool
  // 1c. register /profile command
  // 1d. attach lifecycle hooks (before_agent_start, session_before_compact, session_shutdown)
}
```

### 2. System Prompt Injection (`before_agent_start`)

The extension returns a modified `systemPrompt` with a `<user_profile>` block appended:

```
<user_profile>
--- always ---
[Identity]
[Communication Preferences]
[Coding Preferences]

--- current context ---
[[auto] Projects]
[[auto] Technical Interests]

--- available sections ---
  [ref] Past Decisions  (use `/profile view --section "Past Decisions"`)

--- hints ---
Update the profile with updateProfile when you detect stable,
long-term preferences, project facts, or communication patterns.
</user_profile>
```

Three-injection-mode contract:
- Always sections: always appended
- Auto sections: top-k by relevance scoring
- Ref sections: not injected; only heading name is listed

### 3. updateProfile Tool

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `section` | string | Section heading (e.g. `Coding Preferences`, `[auto] Projects`) |
| `content` | string | Content to write |
| `mode` | `"append" \| "upsert" \| "replace"` | Write mode. Default `"append"` |
| `reason` | string | Why this belongs in the long-term profile |

**Write Modes:**

| Mode | Behavior | Use Case |
|------|----------|----------|
| `append` | Append text to end of section | New observations, never clobbers |
| `upsert` | Match line-start `key:` — overwrite matching lines, append rest | Structured key-value data |
| `replace` | Full section replacement | Obsolete info, section rewrite |

**Validation Chain (executed in order, first failure aborts):**

1. **Section allowlist**: Always-section `Identity` → append only; `Communication`/`Coding` → append/upsert only; `[auto]`/`[ref]` → all modes
2. **Sensitive content filter**: reject API keys, tokens, passwords, secrets (regex patterns)
3. **Deduplication**: if `content` overlap with existing section content > 60%, reject
4. **Reason non-empty**: must provide justification
5. **Longevity check**: reason must imply long-term value ("always", "长期", "consistently", etc.)

**Returns:** success/failure with message and updated section name with timestamp.

### 4. `/profile` Command

| Subcommand | Behavior |
|------------|----------|
| `view` | Show full profile.md |
| `view --section <keyword>` | Filter to matching sections (fuzzy heading match) |
| `edit` | Print file path, prompt user to edit externally |
| `update` | Inject steer message → AI runs review → calls updateProfile |
| `sections` | List all sections with type tag + timestamp |
| `enable` | Set `disabled: false` in frontmatter, resume injection |
| `disable` | Set `disabled: true`, skip injection (profile file preserved) |

**`/profile sections` output:**
```
Profile: enabled

[always] Identity                    updated: 2026-07-06
[always] Communication Preferences   updated: 2026-07-06
[auto]   Projects                    updated: 2026-07-06
[auto]   Technical Interests         updated: 2026-07-06
[ref]    Past Decisions              updated: 2026-06-30
```

### 5. Update Trigger Priority

```
1.  /profile update                    ← explicit user command
2.  session_before_compact hook        ← inject review request before compaction
3.  session_shutdown hook              ← safety net review on session end
4.  AI autonomous updateProfile call   ← constrained by validation chain
```

- User command always takes priority.
- Compaction hook triggers a review message (`sendUserMessage` with `deliverAs: "nextTurn"`) asking AI to summarize long-term behavioral changes and call `updateProfile` if warranted.
- Session shutdown is a lighter version — only triggers if the session had substantial new exchanges.
- AI autonomous calls are fully gated by the validation chain above.

### 6. Enable/Disable Control

- `disabled` flag in `profile.md` frontmatter
- When disabled: `before_agent_start` skips all profile injection; `/profile` commands still work
- `enable`/`disable` subcommands toggle the flag

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `profile.md` missing | Auto-create with template |
| `profile.md` parse error | Graceful degradation: skip injection, emit single notification via `ctx.ui.notify` |
| Write conflict (concurrent) | Read-parse-write with retry; no file lock needed given single-session access pattern |
| User manually edits file | Taken as source of truth on next read — no merge conflicts possible |
| Sensitive content flagged | Tool returns error with reason; no profile corruption |

---

## Future Considerations (Out of Scope)

- Embedding-based auto section retrieval (replace keyword matching)
- Multi-profile support (work vs personal)
- Profile diff / changelog
- Share profile across Pi installations
- Profile-aware compaction hinting

---

## Self-Review Checklist

- [x] No TBD/TODO placeholders
- [x] Section type convention (always/auto/ref) is consistent across design
- [x] Validation chain is explicit and ordered
- [x] Update priority is unambiguous
- [x] Error scenarios are covered
- [x] /profile subcommands are fully specified
- [x] Tool parameters and modes are defined

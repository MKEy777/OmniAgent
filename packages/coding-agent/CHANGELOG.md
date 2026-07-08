# Changelog

## [Unreleased]

### Added

- Plan Mode: read-only code analysis agent with plan_write tool and bash allowlist
- Commit Mode: plan executor that reads plan.json, implements tasks, runs tests, and commits
- Memory extension: two-level storage (global + project), three-layer injection, memory_log/memory_search tools, auto-consolidate
- Context.md session history with character-based auto-compression

### Fixed

- Windows TUI bash output decoding with GB18030 fallback for Chinese text

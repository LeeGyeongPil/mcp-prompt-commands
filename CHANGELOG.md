# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-11-18

### Fixed
- `--format skills` now writes spec-valid skill names and folders (lowercase letters, digits, single hyphens, at most 64 characters): underscores become hyphens, so `mock-code_review` is now `mock-code-review` (the slash command name changes; the `commands` format is unchanged). The next `generate` deletes the old underscore-named skill's `SKILL.md` file when it is still the unmodified generated file and keeps edited ones.

## [0.1.0] - 2026-11-17

First release.

### Added
- `list`, `generate`, `get` and `check` commands.
- Reads existing MCP configs without modifying them: Claude Code (`.mcp.json`, `~/.claude.json` user and local scope), VS Code (`.vscode/mcp.json`), Codex (`config.toml`), with `${VAR}` and `${VAR:-default}` expansion. An unreadable default config file is reported as a warning and the other sources still load.
- stdio and Streamable HTTP servers, `prompts/list` pagination, `prompts/get` rendering with roles and placeholders for non-text content. Pagination stops with a server error when a server repeats a cursor or returns more than 1000 pages.
- Slash-command (`commands/<server>/<prompt>.md`) and skill (`skills/<server>-<prompt>/SKILL.md`) output in `live`, `static` and `agent` modes. `--bin` accepts only letters, digits, spaces and `. _ / : @ + = , -`.
- Unexpected extra arguments are rejected with exit code 2 and a hint to quote option values that contain spaces.
- Lock file and `check` for CI drift detection (exit code 1).
- English and Korean output (`--lang`, `MCP_PROMPT_COMMANDS_LANG`, locale), with tables padded by display width.
- Practice mock MCP server and `npm run demo`.
- The package is built (`dist/`) before it is packed or published.

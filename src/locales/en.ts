/** English messages. Keys must match ko.ts exactly (checked by the compiler and by a test). */
export const en = {
  "label.warning": "warning",
  "label.error": "error",

  "err.config_parse": "Cannot read {file}: {detail}. Fix the file or pass a different --config.",
  "err.config_missing": "Config file not found: {file}. Check the --config path.",
  "err.config_format":
    "Cannot tell which client {file} belongs to. Expected a top-level \"mcpServers\" (Claude Code), \"servers\" (VS Code) or a .toml file (Codex).",
  "err.unterminated_quote": "Unterminated quote in: {input}",
  "err.unknown_argument": "Prompt \"{prompt}\" has no argument \"{name}\". Valid arguments: {valid}.",
  "err.args_json": "--args-json must be a JSON object of string values ({detail}).",
  "err.arg_format": "--arg expects name=value, got \"{item}\".",
  "err.too_many_values": "Prompt \"{prompt}\" takes at most {max} argument(s) but {count} values were given.",
  "err.no_such_server": "No server named \"{name}\". Servers found: {available}. Run `mcp-prompt-commands list` to see them.",
  "err.server_protocol": "The server returned error {code}: {detail}",
  "err.repeat_cursor":
    "The server returned a repeating or endless prompts/list cursor, so listing was stopped. This is a bug in that server; fix its pagination.",
  "err.connect": "Could not talk to the server: {detail}. Use --verbose to see its stderr and --timeout to wait longer.",
  "err.bad_bin": "--bin \"{bin}\" is not allowed: it must be non-empty and use only letters, digits, spaces and . _ / : @ + = , - (no quotes, ; & | < > ( ) $ ! or backticks).",
  "err.unsafe_path": "--config path \"{path}\" has characters that cannot be written safely into a command file. Use letters, digits and . _ / : @ + = , - only.",
  "err.get_usage": "Usage: mcp-prompt-commands get <server> <prompt> [--arg name=value ...] [values ...]",
  "err.missing_required": "Missing required argument(s): {names}. Usage: {usage}",
  "err.template_rejected":
    "The server rejected the template request ({code}: {detail}). Run `mcp-prompt-commands generate` again; it will switch this prompt to agent-guided mode.",
  "err.no_lock": "No lock file at {file}. Run `mcp-prompt-commands generate` first.",
  "err.lock_invalid": "The lock file {file} is not valid ({detail}). Delete it and run `generate` again.",
  "err.bad_option": "{detail}. Run with --help to see the options.",
  "err.bad_lang": "--lang must be en or ko, got \"{value}\".",
  "err.bad_value": "{option} must be one of {allowed}, got \"{value}\".",
  "err.bad_timeout": "--timeout must be a positive number of milliseconds, got \"{value}\".",
  "err.unknown_command": "Unknown command \"{name}\". Commands: list, generate, get, check. Run with --help for details.",
  "err.unknown_option": "Unknown option \"{option}\". Run with --help to see the options.",
  "err.option_needs_value": "Option \"{option}\" needs a value.",
  "err.option_takes_no_value": "Option \"{option}\" does not take a value.",
  "err.extra_args": "\"{command}\" does not take extra arguments, got: {values}. Quote option values that contain spaces.",
  "err.extra_args_quote":
    "\"{command}\" does not take extra arguments, got: {values}. If they are part of {option}, quote the whole value: {option} \"{value}\"",
  "err.on_server": "Server \"{server}\": {reason}",

  "reason.permission_denied": "permission denied",
  "reason.is_directory": "it is a directory, not a file",
  "reason.not_found": "file not found",
  "reason.os_error": "system error {code}",
  "reason.invalid_json": "not valid JSON (line {line}, column {column})",
  "reason.invalid_toml": "not valid TOML (line {line}, column {column})",
  "reason.invalid_toml_plain": "not valid TOML",
  "reason.json_not_object": "expected an object",
  "reason.json_not_string": "\"{name}\" is not a string",
  "reason.lock_unsupported": "unsupported lock format",
  "reason.command_not_found": "command \"{command}\" was not found",
  "reason.timeout": "no answer within {ms} ms",
  "reason.connection_closed": "the server closed the connection (it may have exited during startup)",
  "reason.unreachable": "cannot reach the server ({code})",
  "reason.http_status": "the server answered HTTP {status}",
  "content.binary_resource": "binary resource",

  "skip.input_var": "uses ${input:{ids}}, which needs interactive input; replace it with an environment variable",
  "skip.unset_var": "environment variable(s) not set and no default: {vars}",
  "skip.invalid_entry": "entry is not an object",
  "skip.url_without_type": "has a url but no \"type\"; add \"type\": \"http\"",
  "skip.sse": "legacy SSE transport is not supported yet",
  "skip.unknown_type": "unsupported transport type \"{type}\"",
  "skip.oauth": "needs OAuth sign-in, which this tool does not perform",
  "skip.no_command_or_url": "has neither a command nor a url",
  "skip.disabled": "disabled in the config",
  "skip.shadowed": "same name already defined by a higher-priority source ({source})",
  "skip.no_prompts": "the server does not offer prompts",
  "skip.auth": "the server requires authentication (OAuth or a token)",

  "warn.nontext": "{type} content cannot be placed in a text prompt and was replaced by a placeholder ({detail})",
  "warn.template_rejected":
    "The server rejected placeholder values for prompt \"{prompt}\" (error {code}); generated an agent-guided file instead of a template",
  "warn.server_failed": "Server \"{server}\": {reason}",
  "warn.server_skipped": "Server \"{server}\" skipped: {reason}",
  "warn.name_collision": "Prompt \"{prompt}\" of server \"{server}\" collides after normalization and was named \"{id}\"",
  "warn.skipped_user_file": "{path} exists and was not generated by this tool; left untouched",
  "warn.skipped_edited_file": "{path} was edited after generation; left untouched (use --force to overwrite)",
  "warn.config_unreadable": "Ignored config file {file}: {detail}",
  "warn.bin_missing":
    "\"{bin}\" was not found on PATH. Install it (npm i -g mcp-prompt-commands) or pass --bin \"npx -y mcp-prompt-commands\"",

  "list.no_config": "No MCP configuration found. Looked for .mcp.json, ~/.claude.json, .vscode/mcp.json and ~/.codex/config.toml (or use --config).",
  "list.error": "error",
  "list.skipped": "skipped",
  "list.count": "{n} prompt(s)",
  "list.col_prompt": "PROMPT",
  "list.col_command": "COMMAND",
  "list.col_arguments": "ARGUMENTS",
  "list.col_description": "DESCRIPTION",
  "list.required": "required",
  "list.skipped_line": "skipped: {name} ({source}) - {reason}",

  "file.created": "created  ",
  "file.updated": "updated  ",
  "file.unchanged": "unchanged",
  "file.skipped_user": "kept     ",
  "file.skipped_edited": "kept     ",
  "file.removed": "removed  ",
  "gen.dry_run": "Dry run: nothing is written.",
  "gen.nothing": "No prompts found, nothing to generate.",
  "gen.lock_written": "Lock file: {path}",

  "check.server_missing": "server \"{server}\" is in the lock file but not in the current configuration",
  "check.drift_in": "Drift in server \"{server}\":",
  "check.added": "added",
  "check.removed": "removed",
  "check.changed": "changed",
  "check.no_drift": "Checked {prompts} prompt(s) on {servers} server(s): no drift.",
  "check.field_title": "title",
  "check.field_description": "description",
  "check.field_arguments": "arguments",
  "check.field_definition": "definition",
  "check.field_body": "body",

  "help.text": `mcp-prompt-commands - turn MCP server prompts into slash-command or skill files

Usage:
  mcp-prompt-commands <command> [options]

Commands:
  list                         Show servers found in your configs and the prompts they offer
  generate                     Write one command (or skill) file per prompt, plus a lock file
  get <server> <prompt> [v..]  Fetch one prompt from its server and print it as Markdown
  check                        Compare the lock file with the servers (exit 1 on drift)

Options:
  --config <file>        Read this config file instead of the defaults (repeatable)
  --source <list>        Limit default configs: claude,vscode,codex
  --server <name>        Only this server (repeatable or comma-separated)
  --cwd <dir>            Project directory (default: current directory)
  --home <dir>           Home directory to read ~/.claude.json and ~/.codex from
  --out <dir>            Output directory (default: .claude)
  --format <f>           generate: commands (default) or skills
  --mode <m>             generate: live (default), static or agent
  --bin <cmd>            generate: command written into files (default: mcp-prompt-commands)
  --no-allowed-tools     generate: do not write allowed-tools
  --dry-run              generate: show what would be written
  --force                generate: also rewrite generated files that were edited by hand
  --arg <name=value>     get: argument value (repeatable)
  --args-json <json>     get: arguments as a JSON object
  --args-line <text>     get: arguments as one shell-style quoted string
  --template             get: print the template with {{name}} placeholders
  --timeout <ms>         Server connection time limit (default: 10000, or MCP_TIMEOUT)
  --json                 Machine-readable output
  --verbose              Show server stderr
  --lang <en|ko>         Output language (default: MCP_PROMPT_COMMANDS_LANG, then LANG)
  -h, --help             Show this help
  -v, --version          Show the version

Exit codes: 0 ok, 1 drift found, 2 usage error, 3 server error, 4 internal error.`,
} as const;

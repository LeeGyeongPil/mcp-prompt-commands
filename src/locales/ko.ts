import type { en } from "./en.js";

/** 한국어 메시지. 키는 en.ts 와 같아야 한다(컴파일러와 테스트가 확인). */
export const ko: Record<keyof typeof en, string> = {
  "label.warning": "경고",
  "label.error": "오류",

  "err.config_parse": "{file} 을(를) 읽을 수 없습니다: {detail}. 파일을 고치거나 다른 --config 를 지정하세요.",
  "err.config_missing": "설정 파일을 찾을 수 없습니다: {file}. --config 경로를 확인하세요.",
  "err.config_format":
    "{file} 이(가) 어느 클라이언트 설정인지 알 수 없습니다. 최상위에 \"mcpServers\"(Claude Code), \"servers\"(VS Code)가 있거나 .toml 파일(Codex)이어야 합니다.",
  "err.unterminated_quote": "닫히지 않은 따옴표가 있습니다: {input}",
  "err.unknown_argument": "프롬프트 \"{prompt}\" 에는 \"{name}\" 인자가 없습니다. 사용할 수 있는 인자: {valid}.",
  "err.args_json": "--args-json 은 문자열 값으로 된 JSON 객체여야 합니다 ({detail}).",
  "err.arg_format": "--arg 는 이름=값 형태여야 합니다. 받은 값: \"{item}\".",
  "err.too_many_values": "프롬프트 \"{prompt}\" 는 인자를 최대 {max}개 받지만 값이 {count}개 들어왔습니다.",
  "err.no_such_server": "\"{name}\" 서버가 없습니다. 찾은 서버: {available}. `mcp-prompt-commands list` 로 확인하세요.",
  "err.server_protocol": "서버가 오류 {code} 를 돌려줬습니다: {detail}",
  "err.repeat_cursor": "서버가 같은 prompts/list 커서를 반복하거나 끝없이 돌려줘 목록 조회를 멈췄습니다. 해당 서버의 페이지 처리 버그이니 서버를 고치세요.",
  "err.connect": "서버와 통신하지 못했습니다: {detail}. --verbose 로 서버 stderr 를 보고, --timeout 으로 더 기다려 보세요.",
  "err.bad_bin": "--bin \"{bin}\" 은(는) 쓸 수 없습니다. 비어 있으면 안 되고 영문자, 숫자, 공백, . _ / : @ + = , - 만 쓸 수 있습니다(따옴표, ; & | < > ( ) $ ! 백틱 불가).",
  "err.unsafe_path": "--config 경로 \"{path}\" 에는 명령 파일에 안전하게 적을 수 없는 문자가 있습니다. 영문자, 숫자, . _ / : @ + = , - 만 쓰세요.",
  "err.get_usage": "사용법: mcp-prompt-commands get <서버> <프롬프트> [--arg 이름=값 ...] [값 ...]",
  "err.missing_required": "필수 인자가 없습니다: {names}. 사용법: {usage}",
  "err.template_rejected":
    "서버가 템플릿 요청을 거부했습니다 ({code}: {detail}). `mcp-prompt-commands generate` 를 다시 실행하면 이 프롬프트가 에이전트 안내형으로 바뀝니다.",
  "err.no_lock": "{file} 에 lock 파일이 없습니다. 먼저 `mcp-prompt-commands generate` 를 실행하세요.",
  "err.lock_invalid": "lock 파일 {file} 이(가) 올바르지 않습니다 ({detail}). 지우고 `generate` 를 다시 실행하세요.",
  "err.bad_option": "{detail}. --help 로 옵션을 확인하세요.",
  "err.bad_lang": "--lang 은 en 또는 ko 여야 합니다. 받은 값: \"{value}\".",
  "err.bad_value": "{option} 은(는) {allowed} 중 하나여야 합니다. 받은 값: \"{value}\".",
  "err.bad_timeout": "--timeout 은 0보다 큰 밀리초 값이어야 합니다. 받은 값: \"{value}\".",
  "err.unknown_command": "알 수 없는 명령 \"{name}\". 명령: list, generate, get, check. 자세한 내용은 --help 를 보세요.",
  "err.unknown_option": "알 수 없는 옵션 \"{option}\". --help 로 옵션을 확인하세요.",
  "err.option_needs_value": "옵션 \"{option}\" 에는 값이 필요합니다.",
  "err.option_takes_no_value": "옵션 \"{option}\" 은(는) 값을 받지 않습니다.",
  "err.extra_args": "\"{command}\" 는 추가 인자를 받지 않습니다. 받은 값: {values}. 공백이 든 옵션 값은 따옴표로 묶으세요.",
  "err.extra_args_quote":
    "\"{command}\" 는 추가 인자를 받지 않습니다. 받은 값: {values}. {option} 값의 일부라면 값 전체를 따옴표로 묶으세요: {option} \"{value}\"",
  "err.on_server": "서버 \"{server}\": {reason}",

  "reason.permission_denied": "접근 권한이 없습니다",
  "reason.is_directory": "파일이 아니라 디렉터리입니다",
  "reason.not_found": "파일이 없습니다",
  "reason.os_error": "시스템 오류 {code}",
  "reason.invalid_json": "JSON 형식이 올바르지 않습니다 ({line}행 {column}열)",
  "reason.invalid_toml": "TOML 형식이 올바르지 않습니다 ({line}행 {column}열)",
  "reason.invalid_toml_plain": "TOML 형식이 올바르지 않습니다",
  "reason.json_not_object": "객체가 필요합니다",
  "reason.json_not_string": "\"{name}\" 값이 문자열이 아닙니다",
  "reason.lock_unsupported": "지원하지 않는 lock 형식입니다",
  "reason.command_not_found": "명령 \"{command}\" 을(를) 찾을 수 없습니다",
  "reason.timeout": "{ms}ms 안에 응답이 없습니다",
  "reason.connection_closed": "서버가 연결을 닫았습니다(시작 중에 종료됐을 수 있습니다)",
  "reason.unreachable": "서버에 연결할 수 없습니다 ({code})",
  "reason.http_status": "서버가 HTTP {status} 로 응답했습니다",
  "content.binary_resource": "바이너리 리소스",

  "skip.input_var": "${input:{ids}} 를 쓰는데 대화형 입력이 필요합니다. 환경변수로 바꾸세요",
  "skip.unset_var": "환경변수가 설정되지 않았고 기본값도 없습니다: {vars}",
  "skip.invalid_entry": "항목이 객체가 아닙니다",
  "skip.url_without_type": "url 은 있지만 \"type\" 이 없습니다. \"type\": \"http\" 를 추가하세요",
  "skip.sse": "구식 SSE 전송은 아직 지원하지 않습니다",
  "skip.unknown_type": "지원하지 않는 전송 방식 \"{type}\"",
  "skip.oauth": "OAuth 로그인이 필요하며 이 도구는 로그인을 하지 않습니다",
  "skip.no_command_or_url": "command 도 url 도 없습니다",
  "skip.disabled": "설정에서 꺼져 있습니다",
  "skip.shadowed": "우선순위가 더 높은 출처({source})에 같은 이름이 있습니다",
  "skip.no_prompts": "서버가 프롬프트를 제공하지 않습니다",
  "skip.auth": "서버가 인증(OAuth 또는 토큰)을 요구합니다",

  "warn.nontext": "{type} 콘텐츠는 텍스트 프롬프트에 넣을 수 없어 자리표시자로 바꿨습니다 ({detail})",
  "warn.template_rejected":
    "서버가 프롬프트 \"{prompt}\" 의 자리표시자 값을 거부했습니다 (오류 {code}). 템플릿 대신 에이전트 안내형 파일을 만들었습니다",
  "warn.server_failed": "서버 \"{server}\": {reason}",
  "warn.server_skipped": "서버 \"{server}\" 건너뜀: {reason}",
  "warn.name_collision": "서버 \"{server}\" 의 프롬프트 \"{prompt}\" 가 이름 정규화 뒤 겹쳐 \"{id}\" 로 이름 붙였습니다",
  "warn.skipped_user_file": "{path} 은(는) 이 도구가 만든 파일이 아니라서 그대로 두었습니다",
  "warn.skipped_edited_file": "{path} 은(는) 생성 뒤 직접 수정되어 그대로 두었습니다 (덮어쓰려면 --force)",
  "warn.config_unreadable": "설정 파일 {file} 을(를) 무시했습니다: {detail}",
  "warn.bin_missing":
    "PATH 에서 \"{bin}\" 을(를) 찾지 못했습니다. 설치(npm i -g mcp-prompt-commands)하거나 --bin \"npx -y mcp-prompt-commands\" 를 지정하세요",

  "list.no_config": "MCP 설정을 찾지 못했습니다. .mcp.json, ~/.claude.json, .vscode/mcp.json, ~/.codex/config.toml 을 확인했습니다 (--config 도 쓸 수 있습니다).",
  "list.error": "오류",
  "list.skipped": "건너뜀",
  "list.count": "프롬프트 {n}개",
  "list.col_prompt": "프롬프트",
  "list.col_command": "명령",
  "list.col_arguments": "인자",
  "list.col_description": "설명",
  "list.required": "필수",
  "list.skipped_line": "건너뜀: {name} ({source}) - {reason}",

  "file.created": "생성   ",
  "file.updated": "갱신   ",
  "file.unchanged": "변경 없음",
  "file.skipped_user": "유지   ",
  "file.skipped_edited": "유지   ",
  "file.removed": "삭제   ",
  "gen.dry_run": "시험 실행: 아무것도 쓰지 않습니다.",
  "gen.nothing": "프롬프트가 없어 만들 파일이 없습니다.",
  "gen.lock_written": "lock 파일: {path}",

  "check.server_missing": "서버 \"{server}\" 는 lock 파일에 있지만 현재 설정에는 없습니다",
  "check.drift_in": "서버 \"{server}\" 에서 드리프트 발견:",
  "check.added": "추가됨",
  "check.removed": "삭제됨",
  "check.changed": "변경됨",
  "check.no_drift": "서버 {servers}개의 프롬프트 {prompts}개를 확인했습니다: 드리프트 없음.",
  "check.field_title": "제목",
  "check.field_description": "설명",
  "check.field_arguments": "인자",
  "check.field_definition": "정의",
  "check.field_body": "본문",

  "help.text": `mcp-prompt-commands - MCP 서버의 프롬프트를 슬래시 명령·스킬 파일로 만들어 줍니다

사용법:
  mcp-prompt-commands <명령> [옵션]

명령:
  list                         설정에서 찾은 서버와 프롬프트를 보여 줍니다
  generate                     프롬프트마다 명령(또는 스킬) 파일과 lock 파일을 씁니다
  get <서버> <프롬프트> [값..]  서버에서 프롬프트 하나를 받아 Markdown 으로 출력합니다
  check                        lock 파일과 서버를 비교합니다 (드리프트가 있으면 종료 코드 1)

옵션:
  --config <파일>        기본 위치 대신 이 설정 파일을 읽습니다 (여러 번 가능)
  --source <목록>        기본 설정 범위 제한: claude,vscode,codex
  --server <이름>        이 서버만 (여러 번 또는 쉼표로 구분)
  --cwd <폴더>           프로젝트 폴더 (기본: 현재 폴더)
  --home <폴더>          ~/.claude.json 과 ~/.codex 를 읽을 홈 폴더
  --out <폴더>           출력 폴더 (기본: .claude)
  --format <형식>        generate: commands(기본) 또는 skills
  --mode <방식>          generate: live(기본), static, agent
  --bin <명령>           generate: 파일에 적을 명령 (기본: mcp-prompt-commands)
  --no-allowed-tools     generate: allowed-tools 를 쓰지 않습니다
  --dry-run              generate: 쓸 내용만 보여 줍니다
  --force                generate: 직접 수정한 생성 파일도 다시 씁니다
  --arg <이름=값>        get: 인자 값 (여러 번 가능)
  --args-json <json>     get: 인자를 JSON 객체로 전달
  --args-line <문자열>   get: 인자를 셸식 따옴표 문자열 하나로 전달
  --template             get: {{이름}} 자리표시자가 있는 템플릿을 출력
  --timeout <ms>         서버 연결 시간 제한 (기본: 10000, 또는 MCP_TIMEOUT)
  --json                 기계가 읽는 출력
  --verbose              서버 stderr 를 보여 줍니다
  --lang <en|ko>         출력 언어 (기본: MCP_PROMPT_COMMANDS_LANG, 그다음 LANG)
  -h, --help             이 도움말
  -v, --version          버전

종료 코드: 0 성공, 1 드리프트 발견, 2 사용법 오류, 3 서버 오류, 4 내부 오류.`,
};

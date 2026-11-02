#!/usr/bin/env bash
# =============================================================================
# supervisor-verify.sh — 主管一键验收编排（只读为主，串行跑本套件全部回归入口）
#
# 用法：
#   bash setup/supervisor-verify.sh            # 全量（含 setup/selftest.sh，较慢）
#   bash setup/supervisor-verify.sh --fast     # 快速（跳过 selftest.sh；其余照跑）
#   bash setup/supervisor-verify.sh --json     # 机器可读 JSON
#
# 步骤（按序；单步失败不影响后续，最后统一 exit 1）：
#   1) supervisor-doctor.sh --no-network     环境体检（有 FAIL 则本步 FAIL）
#   2) setup/sync-kit.sh --check             源↔kit 镜像一致性
#   3) setup/verify-facts.sh --offline       事实/预算/许可证复检
#   4) 插件 node --check ×2                   index.js / client.js
#   5) 插件 smoke                            scripts/smoke.mjs
#   6) 插件 host-smoke                       scripts/host-smoke.mjs
#   7) 插件 compat                           scripts/compat-check.mjs
#   8) peek-mailbox.mjs --self-test          只读排队消息脚本自测
#   9) setup/patches/*/patch.py selftest     可选补丁自测（只读真实安装；逐个跑）
#  10) setup/selftest.sh                     全量安装包回归（--fast 时 SKIP）
#  11) git 卫生                              git diff --check + HEAD 记录（不要求工作树干净）
#  12) 密钥扫描                              git grep 常见密钥赋值，排除示例/模板后必须 0 命中
#
# 输出：步骤表 + 失败步骤的输出尾部；末行汇总「PASS n / FAIL n / SKIP n」。
# 退出码：0 = 无 FAIL；1 = 有 FAIL；2 = 用法错误。
# 约束：只读 + 仅写系统临时目录（mktemp），不写工作区；不递归调用 supervisor-verify.sh。
# 兼容：macOS 自带 bash 3.2（不用 mapfile/关联数组/${var,,}）。
# =============================================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(pwd)"
if [ -d "$WORKSPACE/setup" ]; then KIT_DIR="$WORKSPACE/setup"; else KIT_DIR="$SCRIPT_DIR"; fi
KIT_ROOT="$(cd "$KIT_DIR/.." && pwd)"

# ---- 参数 -------------------------------------------------------------------
MODE_JSON=0
FAST=0
usage() { sed -n '/^# 用法：/,/^# 步骤/p' "$0" | sed 's/^# \{0,1\}//'; }
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1 ;;
    --json) MODE_JSON=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "错误：未知参数 ${arg}（可用：--fast / --json / -h）" >&2; exit 2 ;;
  esac
done

if [ ! -d "$KIT_DIR" ]; then
  echo "错误：找不到套件目录 ${KIT_DIR}（脚本应在 <工作区>/setup/ 内运行）" >&2
  exit 2
fi

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/ps-supervisor-verify.XXXXXX")" || { echo "错误：无法创建临时目录" >&2; exit 2; }
TMPD="$(cd "$TMPD" && pwd)"
cleanup() { rm -rf "$TMPD"; }
trap cleanup EXIT

# ---- 结果收集（bash 3.2：并行索引数组）--------------------------------------
STEP_ID=()
STEP_STATUS=()
STEP_NAME=()
STEP_DUR=()
STEP_NOTE=()

clean_text() { printf '%s' "$1" | tr '\n\r\t' '   ' | sed -e 's/\\/\\\\/g' -e 's/"/'"'"'/g'; }

add_step() { # $1=id $2=status $3=name $4=dur $5=note
  local i
  i=${#STEP_ID[@]}
  STEP_ID[$i]="$1"
  STEP_STATUS[$i]="$2"
  STEP_NAME[$i]="$(clean_text "${3:-}")"
  STEP_DUR[$i]="${4:-}"
  STEP_NOTE[$i]="$(clean_text "${5:-}")"
}

now_ms() { echo "$(( $(date +%s) * 1000 ))"; }   # 秒级精度（bash 3.2 无 %N）

# 关键输出尾部（失败时给人看）：最后 6 行、最多 400 字符
tail_note() {
  local f="$1"
  [ -f "$f" ] || { printf ''; return 0; }
  tail -n 6 "$f" 2>/dev/null | tr '\n' '|' | cut -c1-400
}

# 运行一个步骤：成功 → PASS；失败 → FAIL（附输出尾部）
run_step() { # $1=id $2=name $3..=命令
  local id name log t0 t1 dur rc note
  id="$1"; name="$2"; shift 2
  log="$TMPD/$id.log"
  t0="$(now_ms)"
  if "$@" >"$log" 2>&1; then rc=0; else rc=$?; fi
  t1="$(now_ms)"
  dur=$((t1 - t0))
  if [ "$rc" -eq 0 ]; then
    add_step "$id" PASS "$name" "${dur}ms" ""
  else
    note="exit ${rc}；$(tail_note "$log")"
    add_step "$id" FAIL "$name" "${dur}ms" "$note"
  fi
}

# 标记 SKIP（原因写 note）
skip_step() { # $1=id $2=name $3=reason
  add_step "$1" SKIP "$2" "-" "$3"
}


# 打印刚加入的那一步（人类模式；JSON 模式在最后统一输出）
emit_last() {
  local i=$(( ${#STEP_ID[@]} - 1 ))
  if [ "$MODE_JSON" -eq 0 ]; then
    printf '%-4s %-8s %s\n' "${STEP_STATUS[$i]}" "${STEP_DUR[$i]}" "${STEP_NAME[$i]}"
    if [ "${STEP_STATUS[$i]}" = "FAIL" ] && [ -n "${STEP_NOTE[$i]}" ]; then
      printf '     ↳ %s\n' "${STEP_NOTE[$i]}"
    elif [ "${STEP_STATUS[$i]}" = "SKIP" ] && [ -n "${STEP_NOTE[$i]}" ]; then
      printf '     ↳ %s\n' "${STEP_NOTE[$i]}"
    fi
  fi
}

# =============================================================================
# 按序执行
# =============================================================================
echo_header() {
  if [ "$MODE_JSON" -eq 0 ]; then
    echo "主管一键验收（fast=${FAST}）· 工作区: $WORKSPACE"
    echo "套件: $KIT_DIR    临时目录: $TMPD"
    echo "----------------------------------------------------------------------------"
  fi
}
echo_header

# ---- 1) doctor --no-network -------------------------------------------------
if [ -f "$KIT_DIR/supervisor-doctor.sh" ]; then
  run_step doctor "doctor --no-network（环境体检）" \
    bash "$KIT_DIR/supervisor-doctor.sh" --no-network
else
  skip_step doctor "doctor --no-network（环境体检）" "未找到 supervisor-doctor.sh"
fi
emit_last

# ---- 2) sync-kit --check ----------------------------------------------------
if [ -f "$KIT_DIR/sync-kit.sh" ]; then
  run_step sync "sync-kit --check（镜像一致性）" bash "$KIT_DIR/sync-kit.sh" --check
else
  skip_step sync "sync-kit --check（镜像一致性）" "未找到 sync-kit.sh"
fi
emit_last

# ---- 3) verify-facts --offline ---------------------------------------------
if [ -f "$KIT_DIR/verify-facts.sh" ]; then
  run_step facts "verify-facts --offline（事实/预算复检）" bash "$KIT_DIR/verify-facts.sh" --offline
else
  skip_step facts "verify-facts --offline（事实/预算复检）" "未找到 verify-facts.sh"
fi
emit_last

# ---- 4~7) 插件 --------------------------------------------------------------
PLUGIN_DIR="$WORKSPACE/plugin/dsh-project-supervisor"
if [ -d "$PLUGIN_DIR" ]; then
  run_step plugin-syntax "插件入口语法（node --check）" bash -c \
    'node --check "$1/index.js" && node --check "$1/client.js"' _ "$PLUGIN_DIR"
  emit_last

  if [ -f "$PLUGIN_DIR/scripts/smoke.mjs" ]; then
    run_step plugin-smoke "插件 smoke（client）" node "$PLUGIN_DIR/scripts/smoke.mjs"
  else
    skip_step plugin-smoke "插件 smoke（client）" "未找到 scripts/smoke.mjs"
  fi
  emit_last

  if [ -f "$PLUGIN_DIR/scripts/host-smoke.mjs" ]; then
    run_step plugin-hostsmoke "插件 host-smoke（host）" node "$PLUGIN_DIR/scripts/host-smoke.mjs"
  else
    skip_step plugin-hostsmoke "插件 host-smoke（host）" "未找到 scripts/host-smoke.mjs"
  fi
  emit_last

  if [ -f "$PLUGIN_DIR/scripts/compat-check.mjs" ]; then
    run_step plugin-compat "插件 compat-check（跨平台）" node "$PLUGIN_DIR/scripts/compat-check.mjs"
  else
    skip_step plugin-compat "插件 compat-check（跨平台）" "未找到 scripts/compat-check.mjs"
  fi
  emit_last
else
  for sid in plugin-syntax plugin-smoke plugin-hostsmoke plugin-compat; do
    case "$sid" in
      plugin-syntax) NM="插件入口语法（node --check）" ;;
      plugin-smoke)  NM="插件 smoke（client）" ;;
      plugin-hostsmoke) NM="插件 host-smoke（host）" ;;
      *)             NM="插件 compat-check（跨平台）" ;;
    esac
    skip_step "$sid" "$NM" "未找到插件目录（可选）"
    emit_last
  done
fi

# ---- 8) peek-mailbox --self-test -------------------------------------------
MAILBOX="$WORKSPACE/.dsh/skills/project-supervisor/scripts/peek-mailbox.mjs"
if [ -f "$MAILBOX" ]; then
  run_step mailbox "peek-mailbox --self-test（只读排队消息）" node "$MAILBOX" --self-test
else
  skip_step mailbox "peek-mailbox --self-test（只读排队消息）" "未找到 scripts/peek-mailbox.mjs"
fi
emit_last

# ---- 9) patches selftest ----------------------------------------------------
PATCH_FILES="$(find "$KIT_DIR/patches" -type f -name 'patch.py' 2>/dev/null | LC_ALL=C sort)"
if [ -z "$PATCH_FILES" ]; then
  skip_step patches "patches selftest（可选补丁）" "未找到 setup/patches/*/patch.py"
  emit_last
else
  PATCH_LOG="$TMPD/patches.log"
  : > "$PATCH_LOG"
  PATCH_N=0
  PATCH_BAD=0
  t0="$(now_ms)"
  while IFS= read -r pf; do
    [ -n "$pf" ] || continue
    PATCH_N=$((PATCH_N + 1))
    echo "--- $pf selftest ---" >> "$PATCH_LOG"
    if ! python3 "$pf" selftest >> "$PATCH_LOG" 2>&1; then PATCH_BAD=$((PATCH_BAD + 1)); fi
  done <<EOF
$PATCH_FILES
EOF
  t1="$(now_ms)"
  dur=$((t1 - t0))
  if [ "$PATCH_BAD" -eq 0 ]; then
    add_step patches PASS "patches selftest（${PATCH_N} 个补丁，只读）" "${dur}ms" ""
  else
    add_step patches FAIL "patches selftest（${PATCH_BAD}/${PATCH_N} 个失败）" "${dur}ms" "$(tail_note "$PATCH_LOG")"
  fi
  emit_last
fi

# ---- 10) selftest（--fast 跳过） -------------------------------------------
if [ "$FAST" -eq 1 ]; then
  skip_step selftest "setup/selftest.sh（安装包全量回归）" "--fast 跳过；收尾请跑全量"
  emit_last
elif [ -f "$KIT_DIR/selftest.sh" ]; then
  run_step selftest "setup/selftest.sh（安装包全量回归）" bash "$KIT_DIR/selftest.sh"
  emit_last
else
  skip_step selftest "setup/selftest.sh（安装包全量回归）" "未找到 selftest.sh"
  emit_last
fi

# ---- 11) git 卫生 -----------------------------------------------------------
if command -v git >/dev/null 2>&1 && ( cd "$WORKSPACE" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 ); then
  GIT_LOG="$TMPD/git-hygiene.log"
  t0="$(now_ms)"
  rc=0
  HEAD_SHA="$( cd "$WORKSPACE" && git rev-parse --short HEAD 2>/dev/null )" || rc=1
  DIRTY_N="$( cd "$WORKSPACE" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ' )"
  echo "HEAD=$HEAD_SHA dirty=$DIRTY_N" > "$GIT_LOG"
  if ! ( cd "$WORKSPACE" && git diff --check >> "$GIT_LOG" 2>&1 ); then rc=1; fi
  t1="$(now_ms)"
  if [ "$rc" -eq 0 ]; then
    add_step git-hygiene PASS "git 卫生（diff --check + HEAD）" "$((t1 - t0))ms" "HEAD=${HEAD_SHA}，未提交 $DIRTY_N 个（不要求干净）"
  else
    add_step git-hygiene FAIL "git 卫生（diff --check + HEAD）" "$((t1 - t0))ms" "空白/冲突标记问题：$(tail_note "$GIT_LOG")"
  fi
else
  skip_step git-hygiene "git 卫生（diff --check + HEAD）" "不是 git 仓库或 git 不可用"
fi
emit_last

# ---- 12) 密钥扫描 -----------------------------------------------------------
if command -v git >/dev/null 2>&1 && ( cd "$WORKSPACE" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 ); then
  SECRET_LOG="$TMPD/secret-scan.log"
  t0="$(now_ms)"
  rc=0
  ( cd "$WORKSPACE" && git grep -nEi '(api[_-]?key|secret|access[_-]?token|password)[[:space:]]*=' -- \
      . ':!*.example' ':!*.template' ':!*.md' ':!setup/' ':!research/' ) > "$SECRET_LOG" 2>&1 || rc=$?
  t1="$(now_ms)"
  case "$rc" in
    0)
      add_step secrets FAIL "密钥扫描（git grep）" "$((t1 - t0))ms" "命中 $(wc -l < "$SECRET_LOG" | tr -d ' ') 行：$(head -n 3 "$SECRET_LOG" | tr '\n' '|' | cut -c1-300)"
      ;;
    1) add_step secrets PASS "密钥扫描（git grep）" "$((t1 - t0))ms" "0 命中（已排除 *.example/*.template/*.md/setup/research）" ;;
    *) add_step secrets SKIP "密钥扫描（git grep）" "$((t1 - t0))ms" "git grep 不可用或参数不兼容（exit ${rc}）" ;;
  esac
else
  skip_step secrets "密钥扫描（git grep）" "不是 git 仓库或 git 不可用"
fi
emit_last

# =============================================================================
# 汇总输出
# =============================================================================
N_PASS=0 N_FAIL=0 N_SKIP=0
i=0
while [ "$i" -lt "${#STEP_ID[@]}" ]; do
  case "${STEP_STATUS[$i]}" in
    PASS) N_PASS=$((N_PASS + 1)) ;;
    FAIL) N_FAIL=$((N_FAIL + 1)) ;;
    *)    N_SKIP=$((N_SKIP + 1)) ;;
  esac
  i=$((i + 1))
done
GENERATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo '')"

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

if [ "$MODE_JSON" -eq 1 ]; then
  printf '{"ok":'
  if [ "$N_FAIL" -gt 0 ]; then printf 'false'; else printf 'true'; fi
  printf ',"workspace":"%s"' "$(json_escape "$WORKSPACE")"
  printf ',"kit":"%s"' "$(json_escape "$KIT_DIR")"
  printf ',"fast":%s' "$FAST"
  printf ',"generatedAt":"%s"' "$GENERATED_AT"
  printf ',"steps":['
  i=0
  while [ "$i" -lt "${#STEP_ID[@]}" ]; do
    [ "$i" -gt 0 ] && printf ','
    printf '{"id":"%s","status":"%s","name":"%s","duration":"%s","note":"%s"}' \
      "$(json_escape "${STEP_ID[$i]}")" "${STEP_STATUS[$i]}" \
      "$(json_escape "${STEP_NAME[$i]}")" "${STEP_DUR[$i]}" "$(json_escape "${STEP_NOTE[$i]}")"
    i=$((i + 1))
  done
  printf '],"summary":{"pass":%d,"fail":%d,"skip":%d}}\n' "$N_PASS" "$N_FAIL" "$N_SKIP"
else
  echo "----------------------------------------------------------------------------"
  echo "汇总: PASS $N_PASS / FAIL $N_FAIL / SKIP $N_SKIP"
  if [ "$N_FAIL" -gt 0 ]; then
    echo "结论: 有 FAIL，先修失败步骤再重跑（失败步骤的输出尾部见上）。"
  elif [ "$N_SKIP" -gt 0 ]; then
    echo "结论: 无 FAIL；有 SKIP（多为可选组件缺失或 --fast 跳过），按需补跑全量。"
  else
    echo "结论: 全部通过。"
  fi
fi

if [ "$N_FAIL" -gt 0 ]; then exit 1; fi
exit 0

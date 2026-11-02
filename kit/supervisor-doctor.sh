#!/usr/bin/env bash
# =============================================================================
# supervisor-doctor.sh — 主管环境只读体检
#
# 用法：
#   bash setup/supervisor-doctor.sh                     # 人类可读表
#   bash setup/supervisor-doctor.sh --json              # 机器可读 JSON
#   bash setup/supervisor-doctor.sh --no-network        # 兼容参数（本脚本不做网络探测，等价于默认）
#   bash setup/supervisor-doctor.sh --workspace <dir>   # 指定体检的工作区（默认当前目录）
#
# 只读：不写任何文件、不改配置、不重启进程；只读 $DSH_HOME（DSH 安装目录）。
# 环境变量：DSH_HOME（默认 ~/.dsh）。
#
# 检查分组：
#   1) 运行时（node / python3 / git）
#   2) 工作区（git 仓库与脏文件、AGENTS.md / SKILL.md 体量与预算）
#   3) 套件（setup/VERSION、sync-kit --check、selftest 存在性）
#   4) 插件（版本、node --check、profile link: 安装）
#   5) 残留（.backups、工作区 .bak.*、临时产物）
#
# 输出：PASS/WARN/FAIL/SKIP + 名称 + 证据/建议；末行「汇总: PASS n / WARN n / FAIL n」
# 退出码：0 = 无 FAIL；1 = 有 FAIL；2 = 用法错误（参数非法/--workspace 不存在）
# 兼容：macOS 自带 bash 3.2（不用 mapfile/关联数组/${var,,}）；Linux/Git Bash 同样可用。
# =============================================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- 参数 -------------------------------------------------------------------
MODE_JSON=0
NO_NETWORK=0
WORKSPACE="$(pwd)"

usage() { sed -n '/^# 用法：/,/^# 环境变量/p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --json) MODE_JSON=1 ;;
    --no-network) NO_NETWORK=1 ;;
    --workspace)
      [ $# -ge 2 ] || { echo "错误：--workspace 需要一个目录参数" >&2; exit 2; }
      WORKSPACE="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "错误：未知参数 $1（可用：--json / --no-network / --workspace <dir> / -h）" >&2; exit 2 ;;
  esac
  shift
done

if [ ! -d "$WORKSPACE" ]; then
  echo "错误：--workspace 目录不存在：$WORKSPACE" >&2
  exit 2
fi
WORKSPACE="$(cd "$WORKSPACE" && pwd)"

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

# 预算常量（与 setup/verify-facts.sh 的注释/断言保持一致；变更时两处同改）
BUDGET_AGENTS=13000
BUDGET_SKILL=38000

# 套件目录：优先工作区内的 setup/（安装后的常见形态），否则回退脚本自身所在套件
if [ -d "$WORKSPACE/setup" ]; then KIT_DIR="$WORKSPACE/setup"; else KIT_DIR="$SCRIPT_DIR"; fi

# ---- 结果收集（bash 3.2：并行索引数组，不用关联数组）------------------------
CHECK_ID=()
CHECK_STATUS=()
CHECK_NAME=()
CHECK_EVIDENCE=()
CHECK_ADVICE=()

# 清洗：去掉换行/制表符/引号，保证人类可读与 JSON 都安全
clean() { printf '%s' "$1" | tr '\n\r\t' '   ' | sed -e 's/\\/\\\\/g' -e 's/"/'"'"'/g'; }

add_check() { # $1=id $2=status $3=name $4=evidence [$5=advice]
  local i ev adv
  i=${#CHECK_ID[@]}
  ev="$(clean "${4:-}")"
  adv="$(clean "${5:-}")"
  CHECK_ID[$i]="$1"
  CHECK_STATUS[$i]="$2"
  CHECK_NAME[$i]="$(clean "${3:-}")"
  CHECK_EVIDENCE[$i]="$ev"
  CHECK_ADVICE[$i]="$adv"
}

need_cmd() { command -v "$1" >/dev/null 2>&1; }

# 在工作区里跑 git（找不到 git 时输出空、返回 1）
ws_git() { ( cd "$WORKSPACE" 2>/dev/null && git "$@" 2>/dev/null ); }

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# =============================================================================
# 1) 运行时
# =============================================================================
if need_cmd node; then
  NODE_VER="$(node -v 2>/dev/null | sed 's/^v//')"
  NODE_MAJOR="${NODE_VER%%.*}"
  case "$NODE_MAJOR" in ''|*[!0-9]*)
    add_check runtime.node WARN "运行时 node" "无法解析版本：${NODE_VER}（建议 Node ≥18）" ;;
  *)
    if [ "$NODE_MAJOR" -ge 18 ]; then
      add_check runtime.node PASS "运行时 node" "v${NODE_VER}（≥18）" ""
    else
      add_check runtime.node FAIL "运行时 node" "v$NODE_VER < 18" "升级 Node 到 ≥18（DSH 要求）"
    fi ;;
  esac
else
  add_check runtime.node FAIL "运行时 node" "未找到 node" "安装 Node ≥18 并加入 PATH"
fi

if need_cmd python3; then
  add_check runtime.python3 PASS "运行时 python3" "$(python3 --version 2>&1 | head -1)（可选；补丁自测与 peek-mailbox 的 zstd 回退需要）" ""
else
  add_check runtime.python3 WARN "运行时 python3" "未找到 python3（可选）" "仅当需要 zstd 回退或运行可选补丁时才需要"
fi

if need_cmd git; then
  add_check runtime.git PASS "运行时 git" "$(git --version 2>&1 | head -1)" ""
else
  add_check runtime.git FAIL "运行时 git" "未找到 git" "安装 git（主管基线/提交需要）"
fi

# =============================================================================
# 2) 工作区
# =============================================================================
if need_cmd git; then
  if ws_git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    WS_HEAD="$(ws_git rev-parse --short HEAD 2>/dev/null)"
    WS_DIRTY="$(ws_git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    add_check workspace.git PASS "工作区 git" "HEAD ${WS_HEAD:-?}，未提交变更 ${WS_DIRTY} 个" ""
    if [ "${WS_DIRTY:-0}" -gt 0 ]; then
      add_check workspace.dirty WARN "工作区未提交变更" "${WS_DIRTY} 个文件未提交" "开工前确认这些改动属于你；提交或 stash 后再跑验收更稳"
    else
      add_check workspace.dirty PASS "工作区未提交变更" "0 个（工作树干净）" ""
    fi
  else
    add_check workspace.git WARN "工作区 git" "$WORKSPACE 不是 git 仓库（或 git 不可用）" "建议先 git init + 首次提交再开工"
  fi
else
  add_check workspace.git SKIP "工作区 git" "git 不可用" ""
fi

check_size() { # $1=id $2=name $3=path $4=budget $5=missing_status
  local id name path budget miss st size
  id="$1"; name="$2"; path="$3"; budget="$4"; miss="$5"
  if [ ! -f "$path" ]; then
    add_check "$id" "$miss" "$name" "未找到 $(basename "$path")（${path}）" "确认工作区已安装主管套件"
    return 0
  fi
  size="$(wc -c < "$path" 2>/dev/null | tr -d ' ')"
  if [ "${size:-0}" -le "$budget" ]; then
    add_check "$id" PASS "$name" "${size}B ≤ 预算 ${budget}B（余 $((budget - size))B）" ""
  else
    add_check "$id" FAIL "$name" "${size}B 超过预算 ${budget}B（超 $((size - budget))B）" "压缩常驻规则或移细节到 SKILL/模板"
  fi
}

check_size workspace.agents "AGENTS.md 体量" "$WORKSPACE/AGENTS.md" "$BUDGET_AGENTS" WARN
check_size workspace.skill "主管 SKILL 体量" "$WORKSPACE/.dsh/skills/project-supervisor/SKILL.md" "$BUDGET_SKILL" WARN

# =============================================================================
# 3) 套件
# =============================================================================
if [ -f "$KIT_DIR/VERSION" ]; then
  add_check kit.version PASS "套件 VERSION" "$(head -1 "$KIT_DIR/VERSION" 2>/dev/null | tr -d '[:space:]')（${KIT_DIR}）" ""
else
  add_check kit.version WARN "套件 VERSION" "未找到 $KIT_DIR/VERSION" "套件可能未安装或不完整（可选）"
fi

if [ -f "$KIT_DIR/selftest.sh" ]; then add_check kit.selftest PASS "套件 selftest" "存在（$KIT_DIR/selftest.sh）" ""
else add_check kit.selftest WARN "套件 selftest" "未找到 selftest.sh" "安装/同步套件后可用一键验收"; fi

if [ ! -f "$KIT_DIR/sync-kit.sh" ]; then
  add_check kit.sync SKIP "套件同步一致性" "未找到 sync-kit.sh，跳过" ""
else
  if ( cd "$KIT_DIR" && bash "$KIT_DIR/sync-kit.sh" --check >/dev/null 2>&1 ); then
    add_check kit.sync PASS "套件同步一致性" "sync-kit --check 一致" ""
  else
    add_check kit.sync FAIL "套件同步一致性" "sync-kit --check 发现漂移（需在源工作区重跑 bash setup/sync-kit.sh）" "改源文件后执行 bash setup/sync-kit.sh 同步镜像"
  fi
fi

# =============================================================================
# 4) 插件（可选）
# =============================================================================
PLUGIN_DIR="$WORKSPACE/plugin/dsh-project-supervisor"
PLUGIN_PKG="$PLUGIN_DIR/package.json"
if [ -f "$PLUGIN_PKG" ]; then
  PLUGIN_VER="$(node -e 'try{process.stdout.write(String(require(process.argv[1]).version||""))}catch(e){}' "$PLUGIN_PKG" 2>/dev/null)"
  add_check plugin.pkg PASS "主管插件版本" "${PLUGIN_VER:-未知}（${PLUGIN_PKG}）" ""
  syntax_bad=0
  for f in index.js client.js; do
    if [ -f "$PLUGIN_DIR/$f" ]; then
      node --check "$PLUGIN_DIR/$f" >/dev/null 2>&1 || syntax_bad=1
    fi
  done
  if [ "$syntax_bad" -eq 0 ]; then add_check plugin.syntax PASS "插件入口语法" "node --check index.js / client.js 通过" ""
  else add_check plugin.syntax FAIL "插件入口语法" "node --check 失败" "看 node 报错修 index.js/client.js"; fi
else
  add_check plugin.pkg WARN "主管插件版本" "未找到插件目录（可选）" "不装面板不影响规则运行"
  add_check plugin.syntax SKIP "插件入口语法" "未找到插件目录" ""
fi

LINK_PATH="$DSH_HOME/profiles/web/node_modules/dsh-project-supervisor"
if [ -e "$LINK_PATH" ]; then
  if [ -L "$LINK_PATH" ]; then
    LINK_TARGET="$(readlink "$LINK_PATH" 2>/dev/null || echo '?')"
    add_check plugin.link PASS "插件安装方式" "link: → $LINK_TARGET" ""
  else
    add_check plugin.link PASS "插件安装方式" "已复制安装（${LINK_PATH}）" ""
  fi
else
  add_check plugin.link WARN "插件安装方式" "$LINK_PATH 不存在" "面板未安装（可选）：bash plugin/dsh-project-supervisor/install-plugin.sh"
fi

# =============================================================================
# 5) 残留
# =============================================================================
BACKUP_DIR="$DSH_HOME/profiles/web/.backups"
if [ -d "$BACKUP_DIR" ]; then
  BAK_N="$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${BAK_N:-0}" -gt 0 ]; then
    add_check residue.backups WARN "安装备份残留" "$BACKUP_DIR 下有 ${BAK_N} 个备份目录" "确认不再需要后清理，避免占用磁盘"
  else
    add_check residue.backups PASS "安装备份残留" "无（$BACKUP_DIR 为空）" ""
  fi
else
  add_check residue.backups PASS "安装备份残留" "无 .backups 目录" ""
fi

WS_BAK_N="$(find "$WORKSPACE" -maxdepth 2 -name '*.bak.*' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${WS_BAK_N:-0}" -gt 0 ]; then
  add_check residue.workspacebak WARN "工作区 .bak 残留" "${WS_BAK_N} 个 *.bak.* 文件" "确认后清理（这些是安装/同步自动备份）"
else
  add_check residue.workspacebak PASS "工作区 .bak 残留" "无" ""
fi

WS_TMP_N="$(find "$WORKSPACE" -maxdepth 2 \( -name '*.tmp' -o -name '*.orig' -o -name '*.rej' \) 2>/dev/null | wc -l | tr -d ' ')"
if [ "${WS_TMP_N:-0}" -gt 0 ]; then
  add_check residue.temp WARN "工作区临时产物" "${WS_TMP_N} 个 *.tmp/*.orig/*.rej" "确认后清理，避免混进提交"
else
  add_check residue.temp PASS "工作区临时产物" "无" ""
fi

# =============================================================================
# 输出
# =============================================================================
N_PASS=0 N_WARN=0 N_FAIL=0 N_SKIP=0
i=0
while [ "$i" -lt "${#CHECK_ID[@]}" ]; do
  case "${CHECK_STATUS[$i]}" in
    PASS) N_PASS=$((N_PASS + 1)) ;;
    WARN) N_WARN=$((N_WARN + 1)) ;;
    FAIL) N_FAIL=$((N_FAIL + 1)) ;;
    *)    N_SKIP=$((N_SKIP + 1)) ;;
  esac
  i=$((i + 1))
done

GENERATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo '')"

if [ "$MODE_JSON" -eq 1 ]; then
  printf '{"ok":'
  if [ "$N_FAIL" -gt 0 ]; then printf 'false'; else printf 'true'; fi
  printf ',"workspace":"%s"' "$(json_escape "$WORKSPACE")"
  printf ',"dshHome":"%s"' "$(json_escape "$DSH_HOME")"
  printf ',"generatedAt":"%s"' "$GENERATED_AT"
  printf ',"checks":['
  i=0
  while [ "$i" -lt "${#CHECK_ID[@]}" ]; do
    [ "$i" -gt 0 ] && printf ','
    printf '{"id":"%s","status":"%s","name":"%s","evidence":"%s","advice":"%s"}' \
      "$(json_escape "${CHECK_ID[$i]}")" "${CHECK_STATUS[$i]}" \
      "$(json_escape "${CHECK_NAME[$i]}")" "$(json_escape "${CHECK_EVIDENCE[$i]}")" \
      "$(json_escape "${CHECK_ADVICE[$i]}")"
    i=$((i + 1))
  done
  printf '],"summary":{"pass":%d,"warn":%d,"fail":%d,"skip":%d}}\n' "$N_PASS" "$N_WARN" "$N_FAIL" "$N_SKIP"
else
  echo "主管体检（只读）· 工作区: $WORKSPACE"
  echo "DSH_HOME: $DSH_HOME"
  echo "----------------------------------------------------------------------------"
  i=0
  while [ "$i" -lt "${#CHECK_ID[@]}" ]; do
    printf '%-4s %-22s %s\n' "${CHECK_STATUS[$i]}" "${CHECK_NAME[$i]}" "${CHECK_EVIDENCE[$i]}"
    if [ -n "${CHECK_ADVICE[$i]}" ]; then
      case "${CHECK_STATUS[$i]}" in
        WARN|FAIL) printf '     ↳ %s\n' "${CHECK_ADVICE[$i]}" ;;
      esac
    fi
    i=$((i + 1))
  done
  echo "----------------------------------------------------------------------------"
  echo "汇总: PASS $N_PASS / WARN $N_WARN / FAIL $N_FAIL$([ "$N_SKIP" -gt 0 ] && echo " / SKIP $N_SKIP")"
  if [ "$N_FAIL" -gt 0 ]; then
    echo "结论: 有 FAIL，按上面建议处理后重跑。"
  elif [ "$N_WARN" -gt 0 ]; then
    echo "结论: 无 FAIL；WARN 建议逐条确认（不阻塞开工）。"
  else
    echo "结论: 全部通过。"
  fi
fi

if [ "$N_FAIL" -gt 0 ]; then exit 1; fi
exit 0

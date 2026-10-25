#!/usr/bin/env bash
# 在任意 DSH 工作区快速建立「项目主管」：写入常驻规则、技能与使用说明。
#
# 用法（需要 Node >= 18；不需要 python）：
#   bash install-supervisor.sh /path/to/workspace                 # 建到指定工作区
#   bash install-supervisor.sh .                                  # 建到当前目录
#   bash install-supervisor.sh /path/to/ws --with-research        # 同时带上调研资料 + DECISIONS 模板
#   bash install-supervisor.sh /path/to/ws --global-skill         # 另装全局技能（所有工作区可用）
#   bash install-supervisor.sh /path/to/ws --force                # 覆盖升级（旧文件先备份为 *.bak.<时间戳>）
#   bash install-supervisor.sh /path/to/ws --dry-run              # 只预检 + 输出计划，不写任何文件
#   bash install-supervisor.sh /path/to/ws --dsh-home <dir>       # 全局技能目录（默认 $DSH_HOME 或 ~/.dsh）
#
# 覆盖策略（默认保守）：
#   - 默认只写缺失文件；已存在的文件跳过并提示「已存在，跳过（--force 覆盖）」。
#   - 只有 --force 才覆盖已有文件，覆盖前逐个备份为 <文件>.bak.<YYYYmmdd-HHMMSS>。
#   - 已有 AGENTS.md 且不是主管规则时：默认生成 AGENTS.supervisor.md 供合并；--force 时备份并覆盖 AGENTS.md。
#     主管规则判定：首行标题「# 项目主管作业规则（本工作区）」或含标记「<!-- dsh-project-supervisor -->」。
#   - 安装成功后写 <workspace>/.dsh/supervisor-kit.json（name/version/installedAt/installer）；
#     同版本且无 force 时重复安装不改动任何已有文件（幂等）。
#   - --dry-run 只做源文件预检并输出计划（含将写入的路径），一次写操作都不执行。
#
# 建立后：在 DSH 里把目标目录注册/打开为工作区，新建会话（cwd 必须是该目录），直接说目标即可。
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLOBAL_SKILL=0
WITH_RESEARCH=0
FORCE=0
DRY_RUN=0
TARGET=""
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"

usage_error() { echo "错误：$*" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --global-skill) GLOBAL_SKILL=1 ;;
    --with-research) WITH_RESEARCH=1 ;;
    --force) FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --dsh-home)
      shift
      [ $# -ge 1 ] || usage_error "缺少 --dsh-home 的目录参数"
      case "$1" in -*) usage_error "缺少 --dsh-home 的目录参数" ;; esac
      [ -n "$1" ] || usage_error "缺少 --dsh-home 的目录参数"
      DSH_HOME_DIR="$1"
      ;;
    --dsh-home=*)
      DSH_HOME_DIR="${1#--dsh-home=}"
      [ -n "$DSH_HOME_DIR" ] || usage_error "缺少 --dsh-home 的目录参数"
      ;;
    -h|--help)
      sed -n '2,/^set -euo pipefail/ { /^set -euo pipefail/d; p; }' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) usage_error "未知参数: $1" ;;
    *) TARGET="$1" ;;
  esac
  shift
done

die() { echo "错误：$*" >&2; exit 1; }

# ---- 基础工具 --------------------------------------------------------------
PLAN=()
CHANGED=0
BACKUP_PATH=""
log() { PLAN+=("$1"); if [ "$DRY_RUN" -eq 0 ]; then echo "    $1"; fi; }

copy_to() { # $1=源文件 $2=目标文件
  if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$(dirname "$2")" || die "创建目录失败: $(dirname "$2")"
    cp "$1" "$2" || die "复制失败: $1 → $2"
  fi
}

backup_file() { # $1=已有文件；结果写入 BACKUP_PATH
  local file="$1" stamp base counter=1
  stamp="$(date +%Y%m%d-%H%M%S)"
  base="$file.bak.$stamp"
  BACKUP_PATH="$base"
  while [ -e "$BACKUP_PATH" ]; do
    BACKUP_PATH="$base-$counter"
    counter=$((counter + 1))
  done
  if [ "$DRY_RUN" -eq 0 ]; then
    cp -p "$file" "$BACKUP_PATH" || die "备份失败: $file"
  fi
}

is_supervisor_rules() { # 精确标记：模板首行标题，或专用 HTML 注释标记
  local file="$1"
  [ -f "$file" ] || return 1
  if head -1 "$file" | grep -qF '# 项目主管作业规则（本工作区）'; then
    return 0
  fi
  if grep -qF '<!-- dsh-project-supervisor -->' "$file"; then
    return 0
  fi
  return 1
}

set_skill_workspace() { # $1=技能目录 $2=workspace（目标绝对路径或 "*"）
  if [ "$DRY_RUN" -eq 1 ]; then return 0; fi
  node -e 'const fs=require("fs");const p=process.argv[1];const w=process.argv[2];const t=fs.readFileSync(p,"utf8");const n=t.replace(/^(\s*workspace:\s*)".*"/m,(m,pre)=>pre+"\""+w.replace(/\\/g,"/")+"\"");fs.writeFileSync(p,n,"utf8");' \
    "$1/SKILL.md" "$2" || die "改写 SKILL.md workspace 元数据失败: $1"
}

count_md() { # 目录下 .md 文件数（目录不存在返回 0）
  if [ ! -d "$1" ]; then echo 0; return 0; fi
  find "$1" -maxdepth 1 -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' '
}

# ---- 参数与目标校验 --------------------------------------------------------
TARGET="${TARGET:-.}"
[ -d "$TARGET" ] || die "目标目录不存在: ${TARGET}（请先创建目录）"
TARGET="$(cd "$TARGET" && pwd)"

command -v node >/dev/null 2>&1 \
  || die "需要 Node >= 18（改写 SKILL.md workspace 元数据用），未找到 node"
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 18 ] 2>/dev/null; then
  die "需要 Node >= 18，当前为 $(node -v 2>/dev/null || echo '未知版本')"
fi

# ---- 预检：任何写入之前一次性列出全部缺失项（M8） --------------------------
MISSING=()
need_file() { [ -s "$KIT_DIR/$1" ] || MISSING+=("$1"); }
need_file AGENTS.supervisor.md
need_file 主管手册.md
need_file DECISIONS.template.md
need_file VERSION
need_file skill/SKILL.md
for tpl in plan.md task-brief.md ledger.md review-gate.md; do
  need_file "skill/templates/$tpl"
done
need_file skill-improving-prompts/SKILL.md
need_file skill-improving-prompts/LICENSE
[ "$(count_md "$KIT_DIR/skill-improving-prompts/references")" -gt 0 ] || MISSING+=("skill-improving-prompts/references/*.md")
[ "$(count_md "$KIT_DIR/skill-improving-prompts/templates")" -gt 0 ] || MISSING+=("skill-improving-prompts/templates/*.md")
if [ -d "$KIT_DIR/patches" ]; then
  [ -n "$(find "$KIT_DIR/patches" -type f -print -quit 2>/dev/null)" ] || MISSING+=("patches/（目录为空）")
fi
if [ "$WITH_RESEARCH" -eq 1 ] && [ "$(count_md "$KIT_DIR/research")" -eq 0 ]; then
  MISSING+=("research/*.md（--with-research）")
fi
KIT_VERSION=""
if [ -f "$KIT_DIR/VERSION" ]; then
  KIT_VERSION="$(tr -d '[:space:]' < "$KIT_DIR/VERSION")"
fi
[ -n "$KIT_VERSION" ] || MISSING+=("VERSION（内容为空）")

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "错误：安装包预检失败，缺少 ${#MISSING[@]} 项（未写入任何文件）：" >&2
  for item in "${MISSING[@]}"; do echo "  - $item" >&2; done
  exit 1
fi

RECORD="$TARGET/.dsh/supervisor-kit.json"
OLD_VERSION=""
if [ -f "$RECORD" ]; then
  OLD_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$RECORD" 2>/dev/null | head -1 || true)"
fi

echo "==> 目标工作区: $TARGET"
if [ -n "$OLD_VERSION" ]; then
  echo "==> 套件版本: v${KIT_VERSION}；已安装: v$OLD_VERSION"
  if [ "$OLD_VERSION" != "$KIT_VERSION" ]; then
    if [ "$FORCE" -eq 1 ]; then
      echo "==> 已安装 v$OLD_VERSION → 更新到 v${KIT_VERSION}（--force 覆盖升级）"
    else
      echo "==> 已安装 v$OLD_VERSION → 更新到 v${KIT_VERSION}（未加 --force：已有文件先保持不变，加 --force 覆盖升级）"
    fi
  fi
else
  echo "==> 套件版本: v${KIT_VERSION}（未安装）"
fi

# ---- 1) AGENTS.md（常驻规则）：--force 优先；默认不覆盖已有规则 --------------
AGENTS_DEST="$TARGET/AGENTS.md"
MERGE_DEST="$TARGET/AGENTS.supervisor.md"
if [ ! -e "$AGENTS_DEST" ]; then
  copy_to "$KIT_DIR/AGENTS.supervisor.md" "$AGENTS_DEST"
  CHANGED=$((CHANGED + 1))
  log "写入 AGENTS.md（主管常驻规则）→ $AGENTS_DEST"
elif [ "$FORCE" -eq 1 ]; then
  backup_file "$AGENTS_DEST"
  copy_to "$KIT_DIR/AGENTS.supervisor.md" "$AGENTS_DEST"
  CHANGED=$((CHANGED + 1))
  log "覆盖 AGENTS.md（主管规则；旧文件已备份：$(basename "$BACKUP_PATH")）→ $AGENTS_DEST"
  if [ -e "$MERGE_DEST" ]; then
    backup_file "$MERGE_DEST"
    copy_to "$KIT_DIR/AGENTS.supervisor.md" "$MERGE_DEST"
    CHANGED=$((CHANGED + 1))
    log "覆盖 AGENTS.supervisor.md（旧文件已备份：$(basename "$BACKUP_PATH")）→ $MERGE_DEST"
  fi
elif is_supervisor_rules "$AGENTS_DEST"; then
  log "AGENTS.md 已是主管规则，跳过（--force 升级覆盖）"
elif [ ! -e "$MERGE_DEST" ]; then
  copy_to "$KIT_DIR/AGENTS.supervisor.md" "$MERGE_DEST"
  CHANGED=$((CHANGED + 1))
  log "已有 AGENTS.md（非主管规则）：已生成 AGENTS.supervisor.md，请合并规则（或加 --force 覆盖）→ $MERGE_DEST"
else
  log "AGENTS.supervisor.md 已存在，跳过（--force 覆盖）"
fi

# ---- 托管目录同步：默认只补缺失文件；--force 逐个备份后覆盖并清理多余文件 ----
SYNC_WRITTEN=0
SYNC_OVERWRITTEN=0
SYNC_SKIPPED=0
SYNC_REMOVED=0
SYNC_SKILL_COPIED=0

sync_tree() { # $1=源目录 $2=目标目录 $3=展示名 $4=workspace（空=不改写）
  local src="$1" dest="$2" label="$3" workspace="${4:-}" list destlist rel
  SYNC_WRITTEN=0
  SYNC_OVERWRITTEN=0
  SYNC_SKIPPED=0
  SYNC_REMOVED=0
  SYNC_SKILL_COPIED=0
  list="$(cd "$src" && find . -type f -print | LC_ALL=C sort | sed 's|^\./||')"
  while IFS= read -r rel; do
    if [ -z "$rel" ]; then continue; fi
    if [ ! -e "$dest/$rel" ]; then
      copy_to "$src/$rel" "$dest/$rel"
      SYNC_WRITTEN=$((SYNC_WRITTEN + 1))
      CHANGED=$((CHANGED + 1))
      if [ "$rel" = "SKILL.md" ]; then SYNC_SKILL_COPIED=1; fi
    elif [ "$FORCE" -eq 1 ]; then
      backup_file "$dest/$rel"
      copy_to "$src/$rel" "$dest/$rel"
      SYNC_OVERWRITTEN=$((SYNC_OVERWRITTEN + 1))
      CHANGED=$((CHANGED + 1))
      if [ "$rel" = "SKILL.md" ]; then SYNC_SKILL_COPIED=1; fi
    else
      SYNC_SKIPPED=$((SYNC_SKIPPED + 1))
    fi
  done <<EOF
$list
EOF

  if [ "$FORCE" -eq 1 ] && [ -d "$dest" ]; then
    destlist="$(cd "$dest" && find . -type f -print | LC_ALL=C sort | sed 's|^\./||')"
    while IFS= read -r rel; do
      if [ -z "$rel" ]; then continue; fi
      if [ -e "$src/$rel" ]; then continue; fi
      backup_file "$dest/$rel"
      if [ "$DRY_RUN" -eq 0 ]; then rm -f "$dest/$rel" || die "删除失败: $dest/$rel"; fi
      SYNC_REMOVED=$((SYNC_REMOVED + 1))
      CHANGED=$((CHANGED + 1))
    done <<EOF
$destlist
EOF
  fi

  if [ $((SYNC_WRITTEN + SYNC_OVERWRITTEN + SYNC_REMOVED)) -gt 0 ]; then
    local summary="写入 ${label}（新增 ${SYNC_WRITTEN}，覆盖 ${SYNC_OVERWRITTEN}，清理 $SYNC_REMOVED 个文件）→ $dest"
    log "$summary"
  else
    log "$label 已存在（$SYNC_SKIPPED 个文件），跳过（--force 覆盖）"
  fi
  if [ "$SYNC_SKILL_COPIED" -eq 1 ] && [ -n "$workspace" ]; then
    set_skill_workspace "$dest" "$workspace"
    log "改写 SKILL.md workspace 元数据 → $workspace"
  fi
}

# 2) project-supervisor 技能目录（SKILL.md + templates/ 四个模板）
sync_tree "$KIT_DIR/skill" "$TARGET/.dsh/skills/project-supervisor" \
  ".dsh/skills/project-supervisor/" "$TARGET"

# 2.5) improving-prompts 技能目录（SKILL.md + LICENSE + references/ + templates/）
sync_tree "$KIT_DIR/skill-improving-prompts" "$TARGET/.dsh/skills/improving-prompts" \
  ".dsh/skills/improving-prompts/" ""

# ---- 3) 使用说明：默认不覆盖；--force 备份后覆盖 ---------------------------
MANUAL_DEST="$TARGET/主管手册.md"
if [ ! -e "$MANUAL_DEST" ]; then
  copy_to "$KIT_DIR/主管手册.md" "$MANUAL_DEST"
  CHANGED=$((CHANGED + 1))
  log "写入 主管手册.md → $MANUAL_DEST"
elif [ "$FORCE" -eq 1 ]; then
  backup_file "$MANUAL_DEST"
  copy_to "$KIT_DIR/主管手册.md" "$MANUAL_DEST"
  CHANGED=$((CHANGED + 1))
  log "覆盖 主管手册.md（旧文件已备份：$(basename "$BACKUP_PATH")）→ $MANUAL_DEST"
else
  log "主管手册.md 已存在，跳过（--force 覆盖）"
fi

# ---- 4) 可选：调研资料 + DECISIONS 模板（默认只补缺失；DECISIONS.md 永不覆盖） --
if [ "$WITH_RESEARCH" -eq 1 ]; then
  if [ "$DRY_RUN" -eq 0 ]; then mkdir -p "$TARGET/research" || die "创建目录失败: $TARGET/research"; fi
  RESEARCH_WRITTEN=0
  RESEARCH_OVERWRITTEN=0
  RESEARCH_SKIPPED=0
  research_list="$(cd "$KIT_DIR/research" && find . -maxdepth 1 -type f -name '*.md' -print | LC_ALL=C sort | sed 's|^\./||')"
  while IFS= read -r rel; do
    if [ -z "$rel" ]; then continue; fi
    if [ ! -e "$TARGET/research/$rel" ]; then
      copy_to "$KIT_DIR/research/$rel" "$TARGET/research/$rel"
      RESEARCH_WRITTEN=$((RESEARCH_WRITTEN + 1))
      CHANGED=$((CHANGED + 1))
    elif [ "$FORCE" -eq 1 ]; then
      backup_file "$TARGET/research/$rel"
      copy_to "$KIT_DIR/research/$rel" "$TARGET/research/$rel"
      RESEARCH_OVERWRITTEN=$((RESEARCH_OVERWRITTEN + 1))
      CHANGED=$((CHANGED + 1))
    else
      RESEARCH_SKIPPED=$((RESEARCH_SKIPPED + 1))
    fi
  done <<EOF
$research_list
EOF
  log "research/（新增 ${RESEARCH_WRITTEN}，覆盖 ${RESEARCH_OVERWRITTEN}，跳过 $RESEARCH_SKIPPED 个文件）→ $TARGET/research"
  if [ ! -e "$TARGET/research/DECISIONS.md" ]; then
    copy_to "$KIT_DIR/DECISIONS.template.md" "$TARGET/research/DECISIONS.md"
    CHANGED=$((CHANGED + 1))
    log "生成 research/DECISIONS.md（来自模板，之后由项目维护）→ $TARGET/research/DECISIONS.md"
  else
    log "research/DECISIONS.md 已存在，保留（用户决策记录不覆盖，--force 也不覆盖）"
  fi
fi

# ---- 4.5) 可选：权限补丁工具（逐文件处理） ---------------------------------
if [ -d "$KIT_DIR/patches" ]; then
  sync_tree "$KIT_DIR/patches" "$TARGET/patches" "patches/" ""
fi

# ---- 5) 可选：全局技能（所有工作区都能用「你当项目主管」触发） --------------
if [ "$GLOBAL_SKILL" -eq 1 ]; then
  sync_tree "$KIT_DIR/skill" "$DSH_HOME_DIR/skills/project-supervisor" \
    "全局技能 $DSH_HOME_DIR/skills/project-supervisor/" "*"
  sync_tree "$KIT_DIR/skill-improving-prompts" "$DSH_HOME_DIR/skills/improving-prompts" \
    "全局技能 $DSH_HOME_DIR/skills/improving-prompts/" ""
fi

# ---- 6) 版本记录：安装成功后写；同版本且无任何改动时不重写（保持幂等） ------
UP_TO_DATE=0
if [ "$CHANGED" -eq 0 ] && [ "$OLD_VERSION" = "$KIT_VERSION" ]; then
  UP_TO_DATE=1
fi
if [ "$UP_TO_DATE" -eq 1 ]; then
  log "已是最新（v${KIT_VERSION}），未改动任何文件"
elif [ "$DRY_RUN" -eq 1 ]; then
  log "写入 .dsh/supervisor-kit.json（version=${KIT_VERSION}）→ $RECORD"
else
  mkdir -p "$TARGET/.dsh" || die "创建目录失败: $TARGET/.dsh"
  INSTALLED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    printf '{\n'
    printf '  "name": "project-supervisor-kit",\n'
    printf '  "version": "%s",\n' "$KIT_VERSION"
    printf '  "installedAt": "%s",\n' "$INSTALLED_AT"
    printf '  "installer": "install-supervisor.sh"\n'
    printf '}\n'
  } > "$RECORD" || die "写入版本记录失败: $RECORD"
  log "写入 .dsh/supervisor-kit.json（v${KIT_VERSION}）→ $RECORD"
fi

# ---- dry-run：只打印计划，绝不写盘 ----------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "[dry-run] 目标：${TARGET}（只预检 + 计划，未写入任何文件）"
  echo "[dry-run] 计划（${#PLAN[@]} 项）："
  for item in "${PLAN[@]}"; do echo "  - $item"; done
  exit 0
fi

cat <<EOF

完成。下一步：
1. 在 DSH 里把 $TARGET 注册/打开为工作区，新建一个会话（cwd 必须是该目录）。
2. 直接说项目目标，或说「你当项目主管」进入主管模式。
3. 想看并行对话框：打开会话页头的「智能体团队」面板点成员行。
4. 冒烟清单见 主管手册.md「下次新会话的冒烟清单」。
EOF

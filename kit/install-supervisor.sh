#!/usr/bin/env bash
# 在任意 DSH 工作区快速建立「项目主管」：写入常驻规则、技能与使用说明。
#
# 用法：
#   bash install-supervisor.sh /path/to/workspace              # 建到指定工作区
#   bash install-supervisor.sh .                               # 建到当前目录
#   bash install-supervisor.sh /path/to/ws --with-research     # 同时带上调研总览 + 决策模板
#   bash install-supervisor.sh /path/to/ws --global-skill      # 另装全局技能（所有工作区可用）
#   可选：--force 覆盖已存在的 AGENTS.md / 主管手册.md
#
# 建立后：在 DSH 里把目标目录注册/打开为工作区，新建会话（cwd 必须是该目录），直接说目标即可。
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLOBAL_SKILL=0
WITH_RESEARCH=0
FORCE=0
TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --global-skill) GLOBAL_SKILL=1 ;;
    --with-research) WITH_RESEARCH=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) echo "未知参数: $1" >&2; exit 2 ;;
    *) TARGET="$1" ;;
  esac
  shift
done

TARGET="${TARGET:-.}"
[ -d "$TARGET" ] || { echo "目标目录不存在: $TARGET" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"
echo "==> 目标工作区: $TARGET"

# 1) AGENTS.md（常驻规则：每个新会话自动注入）
if [ -f "$TARGET/AGENTS.md" ] && grep -q "项目主管" "$TARGET/AGENTS.md" 2>/dev/null; then
  echo "    AGENTS.md 已含主管规则，跳过"
elif [ -f "$TARGET/AGENTS.md" ] && [ "$FORCE" -eq 0 ]; then
  cp "$KIT_DIR/AGENTS.supervisor.md" "$TARGET/AGENTS.supervisor.md"
  echo "    已有 AGENTS.md：已生成 AGENTS.supervisor.md，请把其规则合并进 AGENTS.md（或加 --force 覆盖）"
else
  cp "$KIT_DIR/AGENTS.supervisor.md" "$TARGET/AGENTS.md"
  echo "    写入 AGENTS.md（主管常驻规则）"
fi

# 2) 技能（触发词：「你当项目主管」「开几个对话框并行做」…）
mkdir -p "$TARGET/.dsh/skills/project-supervisor"
cp "$KIT_DIR/skill/SKILL.md" "$TARGET/.dsh/skills/project-supervisor/SKILL.md"
python3 - "$TARGET" "$TARGET/.dsh/skills/project-supervisor/SKILL.md" <<'PY'
import re, sys
target, path = sys.argv[1], sys.argv[2]
t = open(path, encoding='utf-8').read()
t = re.sub(r'^(\s*workspace:\s*)".*"', lambda m: m.group(1) + '"' + target + '"', t, count=1, flags=re.M)
open(path, 'w', encoding='utf-8').write(t)
PY
echo "    写入 .dsh/skills/project-supervisor/SKILL.md（workspace 元数据已指向目标目录）"

# 2.5) 提示词润色技能（主管默认开启，可由 DSH「主管」面板开关关闭）
#      完整技能目录：SKILL.md + LICENSE + references/（14 个 .md）+ templates/（2 个 .md）
mkdir -p "$TARGET/.dsh/skills/improving-prompts"
cp -R "$KIT_DIR/skill-improving-prompts/." "$TARGET/.dsh/skills/improving-prompts/"
echo "    写入 .dsh/skills/improving-prompts/（SKILL.md + LICENSE + references/ + templates/）"

# 3) 使用说明
if [ ! -f "$TARGET/主管手册.md" ] || [ "$FORCE" -eq 1 ]; then
  cp "$KIT_DIR/主管手册.md" "$TARGET/主管手册.md"
  echo "    写入 主管手册.md"
else
  echo "    主管手册.md 已存在，跳过（--force 覆盖）"
fi

# 4) 可选：调研总览 + 决策记录模板
if [ "$WITH_RESEARCH" -eq 1 ]; then
  mkdir -p "$TARGET/research"
  cp "$KIT_DIR"/research/*.md "$TARGET/research/"
  [ -f "$TARGET/research/DECISIONS.md" ] || cp "$KIT_DIR/DECISIONS.template.md" "$TARGET/research/DECISIONS.md"
  echo "    写入 research/（7 份资料 + DECISIONS 模板）"
fi

# 4.5) 可选工具：对话框权限补丁（作用在 DSH 安装上，不是工作区代码）
if [ -d "$KIT_DIR/patches" ]; then
  mkdir -p "$TARGET/patches"
  cp -R "$KIT_DIR"/patches/. "$TARGET/patches/"
  echo "    写入 patches/team-permissions（可选：给对话框设权限范围，见该目录 README）"
fi

# 5) 可选：全局技能（所有工作区都能用「你当项目主管」触发，无需每个工作区再装技能）
if [ "$GLOBAL_SKILL" -eq 1 ]; then
  DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
  mkdir -p "$DSH_HOME/skills/project-supervisor" "$DSH_HOME/skills/improving-prompts"
  cp "$KIT_DIR/skill/SKILL.md" "$DSH_HOME/skills/project-supervisor/SKILL.md"
  cp -R "$KIT_DIR/skill-improving-prompts/." "$DSH_HOME/skills/improving-prompts/"
  echo "    已安装全局技能: $DSH_HOME/skills/project-supervisor/SKILL.md（任意工作区说「你当项目主管」即可）"
  echo "    已安装全局技能: $DSH_HOME/skills/improving-prompts/（SKILL.md + LICENSE + references/ + templates/）"
fi

cat <<EOF

完成。下一步：
1. 在 DSH 里把 $TARGET 注册/打开为工作区，新建一个会话（cwd 必须是该目录）。
2. 直接说项目目标，或说「你当项目主管」进入主管模式。
3. 想看并行对话框：打开会话页头的「智能体团队」面板点成员行。
4. 冒烟清单见 主管手册.md「下次新会话的冒烟清单」。
EOF

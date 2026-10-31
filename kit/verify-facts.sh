#!/usr/bin/env bash
# =============================================================================
# verify-facts.sh — 复检调研资料里的事实（链接可访问性 / GitHub 星数 / DSH 常量 / 补丁状态）
#
# 供 DSH 升级、分享包发布前、或隔一段时间后跑一遍；只读，不修改任何文件。
#
# 用法：
#   bash setup/verify-facts.sh             # 全量检查（需要联网）
#   bash setup/verify-facts.sh --offline   # 跳过联网部分，只查本地事实（DSH 常量 + 补丁状态）
#
# 检查项：
#   1) 引用链接：从 setup/research/*.md 抓取 https 链接、去重、确定性抽样 15 条（12–20 区间），
#      curl -sL -m 10 查 HTTP 状态；404/000/其他非 2xx/3xx 记 WARN。
#   2) GitHub 星数：抽查 5 个关键仓库，与文档快照（research/README.md 2026-10-24 抓取值）比对，
#      漂移 >±10% 记 WARN；API 限流/403 时跳过该仓库并记 WARN。
#   3) DSH 常量：在 <DSH node_modules>/@deepseek-ai/dsh-experimental-agent-team/lib/index.js 里
#      grep DEFAULT_MAX_MEMBERS=16 等 4 个常量，任何缺失记 FAIL。
#   4) 权限补丁状态：调用 python3 patch.py status，调用失败记 FAIL（已应用/未应用都算 PASS）。
#   5) 上下文预算与许可证：AGENTS.md ≤ 10KB、主管 SKILL ≤ 35000B、模板 ≤ 80 行；两技能 catalog 元数据（description+whenToUse）不超过
#      700/500 字符；improving-prompts 正文引用的 references/templates 文件都存在；LICENSE 与
#      THIRD_PARTY_NOTICES.md 含 MIT 版权行；朋友测试指南存在。任何缺失记 FAIL。
#   6) 工作流硬化软检查：AGENTS.md 含「工作流硬化」或「红旗」关键词记 PASS，缺失只记 WARN（不阻塞）。
#
# 汇总 PASS/WARN/FAIL：仅 FAIL 时 exit 1（链接失效、星数漂移只警告不阻塞）。
# 环境变量：DSH_NM  DSH 的 node_modules 路径（默认按 `dsh` 命令所在位置向上查找）。
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_DIR="$SCRIPT_DIR"

OFFLINE=0
for arg in "$@"; do
  case "$arg" in
    --offline) OFFLINE=1 ;;
    -h|--help) sed -n '/^# 用法：/,/^# 汇总/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "错误：未知参数 ${arg}（可用：--offline / -h）" >&2; exit 2 ;;
  esac
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/ps-verify-facts.XXXXXX")"
TMP="$(cd "$TMP" && pwd)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

PASS=0
WARN=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
warn() { WARN=$((WARN + 1)); printf 'WARN  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
skip() { printf 'SKIP  %s\n' "$1"; }

# 五个关键仓库 + 文档快照星数（research/README.md，2026-10-24 抓取；改文档数值时同步改这里）
GITHUB_SNAPSHOT="nTony46/DevSupervisor 27
github/spec-kit 142666
bmad-code-org/BMAD-METHOD 54493
openai/swarm 22073
langchain-ai/langgraph-supervisor-py 1657"

# 从 `dsh` 命令位置向上找 node_modules（与 patch.py 的推断口径一致）
detect_nm() {
  if [ -n "${DSH_NM:-}" ]; then
    printf '%s\n' "$DSH_NM"
    return 0
  fi
  local p
  p="$(command -v dsh || true)"
  [ -n "$p" ] || return 1
  while [ -n "$p" ] && [ "$p" != "/" ] && [ "$p" != "." ]; do
    if [ "$(basename "$p")" = "node_modules" ] && [ -d "$p" ]; then
      printf '%s\n' "$p"
      return 0
    fi
    p="$(dirname "$p")"
  done
  return 1
}

# ---- 1) 引用链接抽查 --------------------------------------------------------
check_links() {
  python3 - "$SETUP_DIR/research" >"$TMP/all-links.txt" <<'PY'
import re
import sys
from pathlib import Path

# 排除中英文常见尾随标点，避免把 `）` `。` 等带进 URL
pattern = re.compile(r'https?://[^\s<>"`)\]）】」,，;；]+')
urls = set()
for p in sorted(Path(sys.argv[1]).glob("*.md")):
    text = p.read_text(encoding="utf-8")
    for m in pattern.finditer(text):
        urls.add(m.group(0).rstrip(".,;:!?"))
for u in sorted(urls):
    print(u)
PY
  local total sample_n n url code
  total="$(wc -l <"$TMP/all-links.txt" | tr -d ' ')"
  if [ "$total" -eq 0 ]; then
    warn "setup/research/*.md 中未抓到任何 https 链接"
    return 0
  fi
  sample_n=15
  [ "$total" -lt "$sample_n" ] && sample_n="$total"
  awk -v n="$sample_n" '
    { all[NR] = $0 }
    END {
      c = NR
      if (c == 0) exit 0
      if (c <= n) { for (i = 1; i <= c; i++) print all[i]; exit 0 }
      step = c / n
      for (i = 1; i <= n; i++) {
        idx = int((i - 1) * step) + 1
        if (idx > c) idx = c
        print all[idx]
      }
    }' "$TMP/all-links.txt" >"$TMP/sample-links.txt"
  n="$(wc -l <"$TMP/sample-links.txt" | tr -d ' ')"
  if [ "$total" -lt 12 ]; then
    warn "可用链接仅 $total 条（少于 12 条），样本不足"
  fi
  echo "  去重后 $total 条链接，抽取 $n 条检查（curl -sL -m 10）"
  while IFS= read -r url; do
    [ -n "$url" ] || continue
    code="$(curl -sL -m 10 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
    [ -n "$code" ] || code=000
    case "$code" in
      2*|3*) pass "HTTP $code  $url" ;;
      000) warn "无法连接（000）  $url" ;;
      404) warn "链接 404  $url" ;;
      *) warn "HTTP $code  $url" ;;
    esac
  done <"$TMP/sample-links.txt"
  return 0
}

# ---- 2) GitHub 星数抽查 -----------------------------------------------------
check_github() {
  local repo expected resp stars ratio
  while read -r repo expected; do
    [ -n "$repo" ] || continue
    resp="$(curl -s -m 10 -H 'Accept: application/vnd.github+json' \
      "https://api.github.com/repos/$repo" 2>/dev/null || true)"
    if printf '%s' "$resp" | grep -qi 'rate limit'; then
      warn "GitHub API 限流/403，跳过 ${repo}（稍后重跑即可）"
    elif ! printf '%s' "$resp" | grep -q '"stargazers_count"'; then
      warn "无法读取 $repo 的星数（响应不含 stargazers_count）"
    else
      stars="$(printf '%s' "$resp" | sed -n 's/.*"stargazers_count"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n 1)"
      if [ -z "$stars" ]; then
        warn "无法解析 $repo 的星数"
      else
        ratio="$(awk -v a="$stars" -v b="$expected" 'BEGIN { d = (a - b) / b; if (d < 0) d = -d; print (d <= 0.10) ? "ok" : "drift" }')"
        if [ "$ratio" = "ok" ]; then
          pass "GitHub $repo: ${stars}★（文档快照 ${expected}★，在 ±10% 内）"
        else
          warn "GitHub $repo: ${stars}★ 与文档快照 ${expected}★ 漂移超过 ±10%"
        fi
      fi
    fi
    sleep 1
  done <<EOF
$GITHUB_SNAPSHOT
EOF
  return 0
}

# ---- 3) DSH 常量检查 --------------------------------------------------------
check_dsh_constants() {
  local nm file name want
  nm="$(detect_nm || true)"
  if [ -z "$nm" ]; then
    fail "未找到 DSH 安装（可用 DSH_NM 指定 node_modules 路径）"
    return 0
  fi
  file="$nm/@deepseek-ai/dsh-experimental-agent-team/lib/index.js"
  if [ ! -f "$file" ]; then
    fail "缺少文件: $file"
    return 0
  fi
  echo "  DSH 安装: $nm"
  while read -r name want; do
    [ -n "$name" ] || continue
    if grep -qE "const ${name} = ${want};" "$file"; then
      pass "DSH 常量 $name = $want"
    else
      fail "DSH 常量缺失或数值不符: $name = ${want}（$file）"
    fi
  done <<EOF
DEFAULT_MAX_MEMBERS 16
DEFAULT_MAX_TASKS 256
DEFAULT_MAX_PENDING_MESSAGES 64
DEFAULT_MAX_MESSAGE_BYTES 65536
EOF
  return 0
}

# ---- 4) 权限补丁状态 --------------------------------------------------------
check_patch_status() {
  local patch_py out line
  patch_py="$SETUP_DIR/patches/team-permissions/patch.py"
  if [ ! -f "$patch_py" ]; then
    fail "缺少文件: $patch_py"
    return 0
  fi
  if out="$(python3 "$patch_py" status 2>&1)"; then
    line="$(printf '%s\n' "$out" | grep -E '^状态:' | head -n 1)"
    pass "patch.py status: ${line:-执行成功}"
  else
    fail "patch.py status 执行失败"
    printf '%s\n' "$out" | tail -n 5 | sed 's/^/      /'
  fi
  return 0
}

# ---- 5) 上下文预算与许可证 ------------------------------------------------
check_context_and_license() {
  local agents_bytes
  agents_bytes="$(wc -c < "$SETUP_DIR/../AGENTS.md" 2>/dev/null | tr -d ' ')"
  if [ -n "$agents_bytes" ] && [ "$agents_bytes" -le 10000 ] 2>/dev/null; then
    pass "AGENTS.md 常驻体量 ${agents_bytes}B ≤ 10000B"
  else
    fail "AGENTS.md 常驻体量 ${agents_bytes:-?}B 超过 10000B 预算"
  fi

  local skill_bytes
  skill_bytes="$(wc -c < "$SETUP_DIR/../.dsh/skills/project-supervisor/SKILL.md" 2>/dev/null | tr -d ' ')"
  if [ -n "$skill_bytes" ] && [ "$skill_bytes" -le 35000 ] 2>/dev/null; then
    pass "主管 SKILL 体量 ${skill_bytes}B ≤ 35000B"
  else
    fail "主管 SKILL 体量 ${skill_bytes:-?}B 超过 35000B 预算（细节移回 SKILL 或模板，别塞常驻）"
  fi

  local tpl_file tpl_lines
  for tpl_file in "$SETUP_DIR/../.dsh/skills/project-supervisor/templates"/*.md; do
    [ -f "$tpl_file" ] || continue
    tpl_lines="$(wc -l < "$tpl_file" | tr -d ' ')"
    if [ "$tpl_lines" -gt 80 ] 2>/dev/null; then
      warn "模板 $(basename "$tpl_file") 有 ${tpl_lines} 行（建议 ≤80 行）"
    fi
  done

  if python3 - "$SETUP_DIR/.." <<'PYEOF'
import re, sys
from pathlib import Path
root = Path(sys.argv[1])
limits = {
    '.dsh/skills/improving-prompts/SKILL.md': 700,
    '.dsh/skills/project-supervisor/SKILL.md': 500,
}
problems = []
for rel, limit in limits.items():
    path = root / rel
    if not path.exists():
        problems.append(f'缺少 {rel}')
        continue
    text = path.read_text(encoding='utf-8')
    front = text.split('---', 2)[1] if text.startswith('---') else ''
    total = 0
    for key in ('description', 'whenToUse'):
        m = re.search(rf'^{key}:\s*"?(.*?)"?\s*$', front, re.M)
        if m:
            total += len(m.group(1))
    if total > limit:
        problems.append(f'{rel} catalog 元数据 {total} 字符 > {limit}')
skill = root / '.dsh/skills/improving-prompts/SKILL.md'
if skill.exists():
    body = skill.read_text(encoding='utf-8')
    for m in re.finditer(r'references/[A-Za-z0-9._/-]+\.md|templates/[A-Za-z0-9._/-]+', body):
        target = root / '.dsh/skills/improving-prompts' / m.group(0)
        if not target.exists():
            problems.append(f'improving-prompts 正文引用缺失: {m.group(0)}')
license_path = root / '.dsh/skills/improving-prompts/LICENSE'
if not license_path.exists() or 'Igor Wnek' not in license_path.read_text(encoding='utf-8', errors='replace'):
    problems.append('improving-prompts LICENSE 缺失或无 Copyright (c) 2026 Igor Wnek')
notices = root / 'setup/THIRD_PARTY_NOTICES.md'
if not notices.exists() or 'Igor Wnek' not in notices.read_text(encoding='utf-8', errors='replace'):
    problems.append('setup/THIRD_PARTY_NOTICES.md 缺失或不含第三方版权行')
guide = root / 'setup/朋友测试指南.md'
if not guide.exists():
    problems.append('setup/朋友测试指南.md 缺失')
for item in problems:
    print(item)
sys.exit(1 if problems else 0)
PYEOF
  then
    pass "上下文预算与许可证自检（体量/catalog/引用/LICENSE/朋友指南）全部通过"
  else
    fail "上下文预算或许可证自检失败（见上）"
  fi
  return 0
}

# ---- 6) 工作流硬化软检查（缺失只 WARN，不阻塞） ----------------------------
check_agents_hardening_soft() {
  local agents="$SETUP_DIR/../AGENTS.md"
  if [ ! -f "$agents" ]; then
    warn "找不到 AGENTS.md，无法检查工作流硬化关键词"
    return 0
  fi
  if grep -qE '工作流硬化|红旗' "$agents"; then
    pass "AGENTS.md 含「工作流硬化」/「红旗」规则（14 条硬化已写入常驻规则）"
  else
    warn "AGENTS.md 未发现「工作流硬化」或「红旗」关键词（可能尚未写入，不阻塞）"
  fi
  return 0
}

# ============================================================================
echo "== 1/6 引用链接抽查 =="
if [ "$OFFLINE" -eq 1 ]; then
  skip "--offline：跳过联网检查（链接 + GitHub 星数）"
else
  check_links
fi

echo
echo "== 2/6 GitHub 星数抽查 =="
if [ "$OFFLINE" -eq 1 ]; then
  skip "--offline：跳过 GitHub API 检查"
else
  check_github
fi

echo
echo "== 3/6 DSH 常量检查 =="
check_dsh_constants

echo
echo "== 4/6 权限补丁状态 =="
check_patch_status

echo
echo "== 5/6 上下文预算与许可证 =="
check_context_and_license

echo
echo "== 6/6 工作流硬化软检查 =="
check_agents_hardening_soft

echo
echo "== 汇总 =="
printf 'PASS: %d  WARN: %d  FAIL: %d\n' "$PASS" "$WARN" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "结果: 失败（FAIL $FAIL 项需要处理；WARN 仅提示）"
  exit 1
fi
echo "结果: 通过（WARN ${WARN} 项仅提示，不阻塞）"

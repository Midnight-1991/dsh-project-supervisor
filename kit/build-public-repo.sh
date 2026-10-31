#!/usr/bin/env bash
# 构建可上传 GitHub 的公开仓库快照（根目录 = DSH 插件包，kit/ = 分享包内容）。
#
# 用法: bash setup/build-public-repo.sh [输出目录]
# 默认输出到 ${TMPDIR:-/tmp}/dsh-project-supervisor-public
#
# 设计：
#   - 根目录放插件包（package.json 含 dsh.bundle），这样 `dsh plugin add github:<owner>/<repo>` 可用；
#   - kit/ 放分享包内容（install-supervisor.* + 模板 + 调研 + 可选补丁 + 插件副本），朋友可直接用；
#   - 复制时脱敏本机绝对路径，并做密钥/路径泄漏断言；
#   - 不联网、不改源工作区；重复执行会重建输出目录。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-${TMPDIR:-/tmp}/dsh-project-supervisor-public}"
PLUGIN="$ROOT/plugin/dsh-project-supervisor"
SETUP="$ROOT/setup"

die() { echo "错误: $*" >&2; exit 1; }
info() { echo "  $*"; }

[ -f "$PLUGIN/package.json" ] || die "找不到插件包: $PLUGIN"
[ -f "$SETUP/public/README.md" ] || die "找不到公开 README 模板: $SETUP/public/README.md"

case "$OUT" in
  *"$ROOT"*) die "输出目录不能在工作区内（避免 git 嵌套）: $OUT" ;;
esac
[ "$OUT" = "/" ] && die "拒绝输出到 /"
rm -rf "$OUT"
mkdir -p "$OUT/scripts" "$OUT/screenshots" "$OUT/kit"

# ---- 1) 根目录：DSH 插件包 -------------------------------------------------
for f in index.js client.js cordis.patch.yml package.json install-plugin.sh install-plugin.mjs; do
  [ -f "$PLUGIN/$f" ] || die "插件缺少文件: $f"
  cp "$PLUGIN/$f" "$OUT/$f"
done
cp "$PLUGIN"/scripts/*.mjs "$OUT/scripts/" 2>/dev/null || true
# 截图：市场与 README 用；带 5 张最新 JPEG
for f in panel.jpg panel-bottom.jpg panel-mode-strict.jpg panel-interview-off.jpg panel-model-collab.jpg; do
  [ -f "$PLUGIN/screenshots/$f" ] && cp "$PLUGIN/screenshots/$f" "$OUT/screenshots/$f"
done
cp "$SETUP/public/README.md" "$OUT/README.md"
for f in SECURITY.md CONTRIBUTING.md; do
  [ -f "$SETUP/public/$f" ] && cp "$SETUP/public/$f" "$OUT/$f"
done
# 市场详情页截图（相对本文件，1–8 张）
cat > "$OUT/screenshots.json" <<'SHOTS'
[
  "screenshots/panel.jpg",
  "screenshots/panel-bottom.jpg",
  "screenshots/panel-mode-strict.jpg",
  "screenshots/panel-interview-off.jpg",
  "screenshots/panel-model-collab.jpg"
]
SHOTS

cp "$SETUP/LICENSE" "$OUT/LICENSE"
cp "$SETUP/THIRD_PARTY_NOTICES.md" "$OUT/THIRD_PARTY_NOTICES.md"

# ---- 2) kit/：分享包内容（朋友装主管用） ----------------------------------
KIT_FILES=(
  install-supervisor.sh install-supervisor.mjs
  AGENTS.supervisor.md 主管手册.md DECISIONS.template.md
  VERSION CHANGELOG.md 安装说明.md 朋友测试指南.md 一键安装口令.md
  sync-kit.sh selftest.sh verify-facts.sh build-dist.sh build-public-repo.sh
  team-roster.template.md team-ledger.template.md
  LICENSE THIRD_PARTY_NOTICES.md
)
for f in "${KIT_FILES[@]}"; do
  [ -f "$SETUP/$f" ] || die "分享包缺少文件: $f"
  cp "$SETUP/$f" "$OUT/kit/$f"
done
cp -R "$SETUP/research" "$OUT/kit/research"
rm -f "$OUT"/kit/research/05-*.md "$OUT"/kit/research/06-*.md "$OUT"/kit/research/08-*.md
rm -f "$OUT"/kit/research/1[0-9]-*.md "$OUT"/kit/research/INCIDENT-*.md
rm -rf "$OUT/kit/research/review-public-repo"
for public_doc in research/README.md 主管手册.md 安装说明.md CHANGELOG.md; do
  if grep -nE 'research/0[568]-|research/1[0-9]-|INCIDENT-|05-acceptance-review|06-beginner-guard|08-interview-review|10-hardening-review|11-installer-fixes-review|12-public-repo-review|13-team-reuse-review|14-publish-review' "$OUT/kit/$public_doc" >/dev/null 2>&1; then
    die "公开文档仍引用内部评审: $public_doc"
  fi
done
public_research_count="$(find "$OUT/kit/research" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
[ "$public_research_count" = "7" ] || die "公开 research 应为 7 个文件，实际 $public_research_count"
cp -R "$SETUP/skill" "$OUT/kit/skill"
cp -R "$SETUP/skill-improving-prompts" "$OUT/kit/skill-improving-prompts"
cp -R "$SETUP/patches" "$OUT/kit/patches"
# 插件副本：让 kit/安装说明 里的 plugin/ 路径成立（去掉开发用 scripts/screenshots）
mkdir -p "$OUT/kit/plugin/dsh-project-supervisor"
for f in index.js client.js cordis.patch.yml install-plugin.sh install-plugin.mjs LICENSE README.md; do
  [ -f "$PLUGIN/$f" ] && cp "$PLUGIN/$f" "$OUT/kit/plugin/dsh-project-supervisor/$f"
done
cp -R "$PLUGIN/screenshots" "$OUT/kit/plugin/dsh-project-supervisor/screenshots"
cp -R "$PLUGIN/scripts" "$OUT/kit/plugin/dsh-project-supervisor/scripts"
# 公开仓库的 kit 副本与分享包 zip 采用同一插件文件清单（README/screenshots/scripts 齐全）
cp "$PLUGIN/package.json" "$OUT/kit/plugin/dsh-project-supervisor/package.json"

[ -d "$SETUP/public/.github" ] && cp -R "$SETUP/public/.github" "$OUT/.github"

# ---- 3) package.json：公开仓库元数据 + beta 标记 ---------------------------
python3 - "$OUT/package.json" <<'PY'
import json, os, sys
path = sys.argv[1]
with open(path, encoding='utf-8') as f:
    p = json.load(f)
p['description'] = ('Beta / under test. Project supervisor panel for DeepSeek Harness: '
                    'a read-only dashboard that checks a workspace against the supervisor kit\'s '
                    'engineering baseline, shows the supervisor workflow and beginner safeguards, '
                    'and copies ready-to-use kickoff commands.')
p['homepage'] = 'https://github.com/Midnight-1991/dsh-project-supervisor#readme'
p['repository'] = {'type': 'git', 'url': 'git+https://github.com/Midnight-1991/dsh-project-supervisor.git'}
p['bugs'] = {'url': 'https://github.com/Midnight-1991/dsh-project-supervisor/issues'}
p['author'] = 'dsh-project-supervisor contributors'
p['engines'] = {'node': '>=18'}
files = [f for f in p.get('files', []) if f != 'screenshots']
if 'THIRD_PARTY_NOTICES.md' not in files:
    files.append('THIRD_PARTY_NOTICES.md')
p['files'] = files
with open(path, 'w', encoding='utf-8') as f:
    json.dump(p, f, ensure_ascii=False, indent=2)
    f.write('\n')

# kit 内插件副本使用同一份元数据，但 files 覆盖分发包里实际存在的文件
kit_pkg = os.path.join(os.path.dirname(path), 'kit', 'plugin', 'dsh-project-supervisor', 'package.json')
if os.path.exists(kit_pkg):
    q = dict(p)
    q['files'] = ['index.js', 'client.js', 'cordis.patch.yml', 'install-plugin.sh',
                  'install-plugin.mjs', 'README.md', 'LICENSE', 'screenshots', 'scripts']
    with open(kit_pkg, 'w', encoding='utf-8') as f:
        json.dump(q, f, ensure_ascii=False, indent=2)
        f.write('\n')
print('  已写入公开包元数据（beta 描述 / repository / engines / kit 副本清单）')
PY

# ---- 4) 脱敏 + 断言 -------------------------------------------------------
python3 - "$ROOT" "$OUT" <<'PY'
import pathlib, sys
root, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
abs_ws = str(root)
import os
home = os.path.expanduser('~')
repls = [
    (abs_ws, '~'),
    ('~/.npm/_npx', '~/.npm/_npx'),
    ('~/.npm/_npx', '~/.npm/_npx'),
    ('~/<用户名>', '~/<用户名>'),
    ('~', '~'),
    ('<HOME>/', '<HOME>/'),
    (os.path.join('~/<workspace>'), '~/<workspace>'),
    ('<workspace>', '<workspace>'),
    ('源工作区', '源工作区'),
    ('其他工作区', '其他工作区'),
    ('其他工作区', '其他工作区'),
    ('本地插件示例', '本地插件示例'),
    ('<redacted>', '<redacted>'),
    ('<redacted>', '<redacted>'),
    ('邮箱', '邮箱'),
    ('ghp_<redacted>', 'ghp_<redacted>'),
    ('githubPat_<redacted>', 'githubPat_<redacted>'),
    ('sk-<redacted>', 'sk-<redacted>'),
    ('<AUTH_TOKEN_FIELD>', '<AUTH_TOKEN_FIELD>'),
    ('<user>', '<user>'),
]
text_ext = {'.md', '.js', '.mjs', '.json', '.yml', '.yaml', '.sh', '.txt', '.template', '.example'}
changed = 0
for p in out.rglob('*'):
    if not p.is_file() or p.suffix.lower() not in text_ext:
        continue
    try:
        s = p.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    t = s
    for old, new in repls:
        t = t.replace(old, new)
    if t != s:
        p.write_text(t, encoding='utf-8')
        changed += 1
print(f'  脱敏：{changed} 个文本文件被改写')
PY

echo '--- 断言 ---'
# compat-check.mjs 里有一条「禁止 <HOME>/ 绝对路径」的断言字符串，属预期保留（根 scripts/ 与 kit 插件副本各一份）
HITS=$(grep -RIl '<HOME>/' "$OUT" 2>/dev/null | grep -v '/scripts/compat-check.mjs$' || true)
[ -z "$HITS" ] || die "输出目录仍有 <HOME>/ 绝对路径: $HITS"
if grep -RIlE 'ghp_<redacted>|githubPat_<redacted>|<AUTH_TOKEN_FIELD>|sk-<redacted>' "$OUT" >/dev/null 2>&1; then
  die "输出目录疑似含密钥"
fi
if grep -RIlE '源工作区|其他工作区|<user>|<redacted>|邮箱|本地插件示例' "$OUT" >/dev/null 2>&1; then
  die "输出目录仍有本机标识: $(grep -RIlE '源工作区|其他工作区|<user>|<redacted>|邮箱|本地插件示例' "$OUT" | head -5)"
fi
node --check "$OUT/index.js" || die "index.js 语法错误"
node --check "$OUT/client.js" || die "client.js 语法错误"
python3 -c "import json,sys; json.load(open('$OUT/package.json', encoding='utf-8'))" || die "package.json 不是合法 JSON"
for rel in install-supervisor.sh install-supervisor.mjs sync-kit.sh selftest.sh verify-facts.sh build-dist.sh build-public-repo.sh 一键安装口令.md AGENTS.supervisor.md 主管手册.md skill/SKILL.md skill-improving-prompts/SKILL.md research/README.md patches/team-permissions/patch.py plugin/dsh-project-supervisor/index.js; do
  [ -f "$OUT/kit/$rel" ] || die "kit 缺文件: $rel"
done
info "断言通过：无本机绝对路径、无密钥特征、JS/JSON 合法、kit 必需文件齐全"

# ---- 5) .gitignore + 汇总 -------------------------------------------------
cat > "$OUT/.gitignore" <<'GI'
# 运行时/构建产物
node_modules/
dist/
.DS_Store
*.log
*.bak
*.bak.*
__pycache__/
*.pyc
GI
SIZE=$(du -sh "$OUT" | awk '{print $1}')
COUNT=$(find "$OUT" -type f | wc -l | tr -d ' ')
echo
echo "公开仓库快照已生成: $OUT"
echo "  文件 $COUNT 个，约 $SIZE"
echo
echo "下一步:"
echo "  1) 创建 GitHub 仓库后： cd \"$OUT\" && git init -b main && git add -A"
echo "     git commit -m 'v0.5.0-beta: dsh-project-supervisor' && git remote add origin <repo-url> && git push -u origin main"
echo "  2) 市场条目模板: setup/public/market-entry.yml → awesome-dsh-plugin/data/plugins/..."

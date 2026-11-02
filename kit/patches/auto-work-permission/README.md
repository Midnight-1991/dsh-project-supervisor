# auto-work-permission：新增「自动工作」权限预设（可选补丁）

> 给「自动工作（无人值守）」场景用：新增一档权限预设 = **workspace-write 沙箱 + 审批 `never`**。
> 能写当前工作区，但需要审批的动作**立即被拒、不弹窗**，让模型继续干别的。
> **只改 DSH 安装里的一个 YAML 文件的一处 config 表**；`selftest` 只在临时副本演练，**真实安装零写入**（sha256 前后一致作证）。
> 本机验证版本：**DSH 0.2.0-rc.2**。

## 是什么 / 为什么

DSH 的权限预设（`/permission` 选择器 / 通用设置里的「默认权限」）是
`@deepseek-ai/dsh-permission-presets` 插件 config 里的一张表：每档把 **沙箱模式** 和 **审批策略** 捆在一起。
本机实测定义位置：

- 文件：`<dsh node_modules>/@deepseek-ai/dsh-base/cordis.patch.yml`
  行号（0.2.0-rc.2，20,780 B，sha256 `9c2be64f…142c252d`）：`:250` `- id: permission` → `:253` `config.presets` → `:254-262` 内置三档
- 全文只有这一个文件定义 `- id: permission`（已 grep 全部 bundle YAML 核实，`dsh-web-app` 不重复定义）
- 字段依据：`@deepseek-ai/dsh-permission-presets/lib/index.js:138-158`（`presets: { <名字>: { sandbox, approval, name?, description? } }`）
  - `sandbox` ∈ `read-only | workspace-write | danger-full-access`（`@deepseek-ai/dsh-sandbox-policy/lib/index.js:27-29`）
  - `approval` ∈ `ask | never`（`@deepseek-ai/dsh-user-approval/lib/types/index.js:17`）
  - `custom` / `auto` 是保留名，其余名字可自定义（`README.zh.md:32,60,136`）

内置三档：

| 预设 | sandbox | approval | 无人值守是否合适 |
|---|---|---|---|
| `read-only` | read-only | ask | ❌ 不能写工作区 |
| `workspace-write` | workspace-write | ask | ❌ 需要审批时弹窗卡住 |
| `danger-full-access` | danger-full-access | never | ❌ 文件范围完全放开 |
| **`auto-work`（本补丁新增）** | **workspace-write** | **never** | ✅ 能写工作区、不弹窗、越权动作立即被拒 |

## 改了什么（1 个文件，1 处 config 表）

```diff
     - id: permission
       name: '@deepseek-ai/dsh-permission-presets'
       config:
         presets:
           read-only: { sandbox: read-only, approval: ask }          # 原内置三档原样保留
           workspace-write: { sandbox: workspace-write, approval: ask }
           danger-full-access: { sandbox: danger-full-access, approval: never }
+          # [auto-work-permission] 自动工作：workspace-write 沙箱 + 审批 never（需要授权的动作立即被拒、不弹窗）
+          auto-work:
+            sandbox: workspace-write
+            approval: never
```

（diff 里内置三档为缩写展示；实际文件是逐行 YAML，补丁只**追加** 4 行，不改内置三档。）

这是**纯配置变更**，不打 JS 补丁。`# [auto-work-permission]` 注释行是幂等 marker；`revert` 依据它 + `.bak` 备份还原。

## 命令（在补丁目录里执行；Python 3 标准库，无第三方依赖、不联网）

```bash
cd setup/patches/auto-work-permission

python3 patch.py status              # 默认子命令，只读
python3 patch.py apply --dry-run     # 只打印将改内容（diff），不写盘
python3 patch.py --dry-run apply     # 同上（--dry-run 也可放在子命令前）
python3 patch.py apply               # 真正打补丁：先建 .bak 备份，再原子写入
python3 patch.py revert --dry-run    # 预览回滚（不写盘）
python3 patch.py revert              # 从最近的 .bak.<YYYYMMDD-HHMMSS> 逐字节还原
python3 patch.py selftest            # 只在 mktemp 副本上演练 apply→幂等→revert，真实安装零写入
```

退出码：`0` 成功；`1` 断言/版本/冲突等失败（**失败自动整体回滚，不会写坏文件**）；`2` 找不到 DSH 安装或目标文件（附可执行提示）。

应用后怎么用：

- 新会话：`/permission auto-work`（选择器里显示 `Auto Work`——自定义预设名走 Title Case，**中文界面不本地化**，见「已知限制」）；或
- 「通用设置 → 默认权限」把 `Auto Work` 设为**未来新会话**的默认值；
- 已经运行中的会话不受影响（权限按会话固定）。

### 输出示例（本机实测，未应用状态）

```text
$ python3 patch.py status
补丁: auto-work-permission v1（DSH「自动工作」权限预设）
目标文件: <HOME>/<you>/.npm/_npx/<hash>/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml
DSH 版本: 0.2.0-rc.2（与本补丁验证版本一致）
当前 sha256: 9c2be64f46a193eff3cca190c26e697e8e8eee25c9b40149dfdb56f8142c252d
状态: NOT APPLIED（未应用，权限预设仍是内置三档）
apply 后: 多出第四档「自动工作」= workspace-write 沙箱 + 审批 never（需要授权即拒绝、不弹窗）。
备份: 无（尚未 apply 过）
```

```text
$ python3 patch.py --dry-run apply
DRY-RUN: 将修改 …/@deepseek-ai/dsh-base/cordis.patch.yml（不写盘、不创建备份）
--- 原版 @deepseek-ai/dsh-base/cordis.patch.yml
+++ 补丁后 @deepseek-ai/dsh-base/cordis.patch.yml
@@ -260,6 +260,10 @@
           danger-full-access:
             sandbox: danger-full-access
             approval: never
+          # [auto-work-permission] 自动工作：workspace-write 沙箱 + 审批 never（需要授权的动作立即被拒、不弹窗）
+          auto-work:
+            sandbox: workspace-write
+            approval: never
 
     - id: shell-env
       name: '@deepseek-ai/dsh-shell-env'
DRY-RUN: 未写入任何文件。
```

```text
$ python3 patch.py apply
备份: …/cordis.patch.yml.bak.20261101-021500
已应用: …/cordis.patch.yml
  - 新增预设: auto-work → sandbox: workspace-write, approval: never
  - 原文件 sha256: 9c2be64f…
  - 新文件 sha256: <应用后哈希>
生效条件: **完整重启 DSH** 后，在 Web 会话里用 `/permission auto-work` 选用；
          或「通用设置 → 默认权限」把它设为新会话默认值。已有会话不变。
回滚: python3 patch.py revert
```

`selftest` 会逐项打印 PASS/FAIL，末尾给出**真实目标文件 sha256（selftest 前/后）**并断言一致，例如：

```text
SELFTEST: PASS（19/19 项；真实 DSH 安装零写入）
```

## 影响面与生效条件

- **只影响新会话**（或用户显式 `/permission auto-work` 切换的会话）；已有会话的权限不变。
- `defaultPreset` 不需要改：组合默认值（workspace-write + ask）仍匹配内置 `workspace-write` 档，
  推断规则不受新增档影响（`lib/index.js:179-185`）；本补丁**不**改默认值。
- **必须完整重启 DSH** 才生效（当前进程已加载旧预设表；刷新 Web 页面不够）。
- **DSH 升级/npx 换目录后补丁丢失**：重新 `status`/`apply` 即可（定位逻辑会找到当前安装）。
- 新增档只多一个可选项：不放宽任何现有会话的沙箱/审批；不删不改内置三档。

## 安全边界与设计

- **只写一个文件**：`<node_modules>/@deepseek-ai/dsh-base/cordis.patch.yml`；不改任何 JS、不写 `~/.dsh`。
- 目标定位不硬编码绝对路径：`--nm` → `DSH_NM` → `command -v dsh` 的 realpath 向上找 `node_modules` →
  `~/.npm/_npx/*/node_modules` glob（要求 dsh 包与目标 YAML 同时存在），取最近修改的。
  显式 `--nm` / `DSH_NM` 是**权威**的：该路径缺目标文件时直接 exit 2，**不会**静默回退到其他安装（避免误改）。
- 写入前做**唯一性断言**：permission 预设表（含内置三档全文）必须恰好命中 1 次、`- id: permission` 唯一、
  位于 `- insert:` 列表内；文件里已存在 `auto-work` 字样但无本补丁 marker 时**拒绝重复添加**。
- 写入前先 `copy2` 生成同目录 `.bak.<YYYYMMDD-HHMMSS>` 并校验 sha256；写入用临时文件 + `os.replace` 原子替换；
  任何一步失败（含写后校验）**自动整体回滚**并校验回滚后 sha256。
- **幂等**：`apply` 检测到 marker 直接返回 0、不重复写、不新增备份；`revert` 检测到未应用直接返回 0。
- `revert` 若发现目标文件在 apply 之后又被改动（当前内容 ≠ 备份+补丁预期），默认拒绝覆盖，需 `--force`。
- 版本门槛：`apply` 在其他 DSH 版本上默认拒绝（`--force` 可强制，失败会自动回滚）。断言用文本不变量，
  **不依赖 PyYAML**（DSH 未自带；开发期已用 DSH 自带 `yaml` 包验证过补丁后文件可解析且 `presets.auto-work` 语义正确）。
- 用户 patch 层提示：`status`/`apply` 会扫描 `~/.dsh/cordis.patch.yml` 与 `~/.dsh/profiles/*/cordis.patch.yml`，
  若发现 `- id: permission` 整行覆盖，会 ⚠ 警告——patch 层**替换整行配置**，会盖掉本补丁新增的档；
  需要在那一层的 `presets` 表里同步写上 `auto-work`。

## 已知限制

- 自定义预设名 `auto-work` 在选择器里显示为 Title Case 的 **`Auto Work`**，中文界面不会本地化
  （内置三档才走本地化标签；`dsh-client-ui-permission-presets/lib/client.js:244-261`）。
  想要中文显示名，可在 `auto-work:` 下补 `name: 自动工作` + `description: …`（config schema 支持，本补丁未加，
  避免超出「只加 workspace-write + never」的最小范围；需要时自行加，注意 `revert` 会按 marker 整体还原）。
- 只影响权限预设表；不改变沙箱/审批服务本身的默认值、不改变已开会话。
- 审批 `never` 的语义是「需要审批的动作立即失败并返回提示」，不是「自动批准」；不要用它做危险操作
  （删除/发布/推送/花钱仍应写成「阻塞」等用户确认）。
- 与「Auto review」不是一回事：`auto` 是实验集成的会话级选项，本补丁新增的是配置预设 `auto-work`，二者并存无关。
- 若用户 patch 层已覆盖 `- id: permission`，`apply` 仍会成功但**不生效**（被后应用的层覆盖）；`status` 会给 ⚠ 提示。

## 替代方案（为什么不那么做）

更「抗升级」的位置是用户 patch 层 `~/.dsh/cordis.patch.yml`：写一条 `- id: permission` 覆盖。
但 DSH 的 patch 语义是**整行替换 config**（`@deepseek-ai/dsh-app-boot/README.zh.md:61`），必须把内置三档
（含未来可能新增的档）完整抄进该层，升级后还得人工同步；本补丁选择改 bundle 文件里的一张表并只追加 4 行，
改动面最小、内置档不重复维护，升级后重跑即可。

## 附：文件清单与来源

| 文件 | 说明 |
|---|---|
| `patch.py` | 补丁脚本（Python 3 标准库）：`status/apply[--dry-run]/revert[--dry-run]/selftest`，`--nm/--dsh-home/--force` |
| `README.md` | 本文件 |

关键来源（DSH 0.2.0-rc.2 安装包内）：

- `@deepseek-ai/dsh-base/cordis.patch.yml:250-262`（权限预设表唯一真源）
- `@deepseek-ai/dsh-permission-presets/lib/index.js:138-158`（presets/Config schema）、`:179-185`（默认档推断）
- `@deepseek-ai/dsh-permission-presets/README.zh.md:32-52`（预设表字段、保留名、`/permission` 用法）
- `@deepseek-ai/dsh-user-approval/lib/types/index.js:17`（`approval ∈ ask|never`）
- `@deepseek-ai/dsh-sandbox-policy/lib/index.js:27-29`（三档 sandbox 模式）
- `@deepseek-ai/dsh-client-ui-permission-presets/lib/client.js:244-261`（自定义预设显示为 Title Case）
- `@deepseek-ai/dsh-app-boot/README.zh.md:61`（patch 层替换整行 config）

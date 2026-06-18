# 使用方法

本包依据《AIを実装した人材採用マッチングシステム開発_仕様説明》的开发规格整理。

## 推荐：使用 `/goal` 连续执行到完成

1. 将本包内容复制到项目根目录。若已有 `CLAUDE.md`，不要覆盖；把 `CLAUDE.md.example` 的规则合并进去即可。
2. 在项目根目录启动 Claude Code：

```bash
claude
```

3. 粘贴 `CLAUDE_CODE_GOAL.txt` 的整行内容。`/goal` 会在每个 turn 完成后重新检查完成条件，不满足就继续下一轮。

也可非交互运行：

```bash
claude -p "$(cat CLAUDE_CODE_GOAL.txt)" --permission-mode auto
```

请只在隔离的分支、worktree 或容器里使用无人值守权限模式，并预先检查仓库中是否含生产凭据。不要使用 `--dangerously-skip-permissions`。

## 兼容方案：使用 `/loop`

若当前 Claude Code 没有 `/goal`，本包已提供 `.claude/loop.md`。启动 Claude Code 后运行：

```text
/loop
```

这是定时循环方案；它会读取 `.claude/loop.md` 并持续推进。对于“上一轮结束后立刻继续直到验收通过”的开发任务，`/goal` 更合适。

## 完成标志

只有当 Claude 输出以下标志，且 `docs/implementation/VERIFICATION.md` 中有全套成功证据，才视为完成：

```text
FINAL_STATUS: COMPLETE
```

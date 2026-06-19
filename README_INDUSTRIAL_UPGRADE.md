# 使用方式

1. 将以下两个文件复制到现有项目根目录：
   - `CLAUDE_CODE_INDUSTRIAL_UPGRADE_TASK.md`
   - `CLAUDE_CODE_INDUSTRIAL_UPGRADE_GOAL.txt`
2. 建议先创建独立分支或 worktree。
3. 在项目根目录运行 `claude`。
4. 将 `CLAUDE_CODE_INDUSTRIAL_UPGRADE_GOAL.txt` 的完整一行粘贴进 Claude Code。
5. 普通交互模式先观察权限请求；确认目录、命令与仓库安全后，再考虑 auto mode。

非交互方式：

```bash
claude --permission-mode auto -p "$(cat CLAUDE_CODE_INDUSTRIAL_UPGRADE_GOAL.txt)"
```

停止：`/goal clear`；查看状态：`/goal`；恢复会话：`claude --continue`。

建议先备份数据库、确认没有生产凭据，并在本地分支、worktree 或容器中运行。不要使用 `--dangerously-skip-permissions`。

---
name: ai-todo
description: "任务管理、进度跟踪、工作日志。通过 ai-todo CLI 管理待办事项（todos）、更新进度（progress）、记录工作日志（work logs）、生成 standup 日报。触发场景：用户提到任务/待办/进度/日志/standup/sprint/项目管理；git commit/push/deploy/merge 后记录进度并完成相关任务；讨论功能规划或任务拆分时创建任务层级。Invoke explicitly via /ai-todo."
---

# AI Todo - Task Management for AI Agents

通过 `ai-todo` CLI 管理任务、跟踪进度、维护工作日志。连接 ai-todo (https://ai-todo.stringzhao.life) 实现跨会话的持久化任务管理。

## Prerequisites

运行任何命令前，先检查认证状态：

```bash
cat ~/.config/ai-todo/credentials.json 2>/dev/null
```

未认证则执行 `ai-todo login`。未安装则执行 `npm install -g ai-todo-cli`。

## Command Discovery

命令从服务端动态加载，**严禁硬编码**。首次使用某命令前用 `--help` 发现参数：

```bash
ai-todo --help                    # 查看所有可用命令
ai-todo <command> --help          # 查看具体命令的参数
```

关键约定：
- 默认输出 **JSON**，`tasks:tree` 输出纯文本
- 参数格式 `--key <value>`（snake_case，如 `--parent_id`）
- 命名空间：`tasks:*` 任务操作，`spaces:*` 空间操作
- 退出码：0=成功，1=错误，2=未认证

## 核心工作流

### 第一步：了解任务结构（每次操作前必做）

```bash
ai-todo tasks:tree
```

输出树形文本，📌 标记项目空间，缩进显示父子关系。用于：
- 找到新任务应归属的项目空间或父任务
- 避免创建重复任务
- 理解现有任务拆分

**关键原则**：任务必须放到正确的项目和父任务下，不要在顶层随意创建。

### 查看任务

```bash
ai-todo tasks:tree                    # 全局任务树
ai-todo tasks:list --filter today     # 今天的任务
ai-todo tasks:list --filter assigned  # 分配给我的任务
```

### 创建任务

当用户描述工作计划或你识别到可拆分的事项时：

1. 先 `tasks:tree` 找到正确的归属位置
2. 创建父任务（或复用已有的）
3. 用 `--parent_id` 创建子任务
4. 合理设置优先级（P0=阻塞项，P1=核心，P2=非关键）

```bash
ai-todo tasks:create --title "实现支付功能" --priority P1
ai-todo tasks:create --title "对接微信支付" --parent_id <父任务ID> --tags backend
```

### 更新进度与完成任务

根据工作阶段选择合适的操作：

- **开始工作**：`tasks:update --id <ID> --progress 20`
- **阶段性进展**：`tasks:update --id <ID> --progress 60` + `tasks:add-log --id <ID> --content "完成了XX"`
- **工作完成**：`tasks:complete --id <ID>`（自动完成子任务）
- **只是记录**：`tasks:add-log --id <ID> --content "做了XX"`

当用户明确说"完成了"，直接用 `tasks:complete`；如果是阶段性进展，用 `tasks:update` 递增 progress。

### Post-action（git commit/push/deploy 之后）

1. `tasks:tree` 找到相关任务
2. 有关联任务 → 更新进度 + 添加日志 + 完成则 `tasks:complete`
3. 无关联任务 → 建议创建一个记录已完成的工作
4. 轻量操作，一条日志总结即可

### Pre-action（规划阶段）

用户讨论功能规划、技术方案、sprint 排期时：
1. 从讨论中提取可执行事项
2. 创建任务层级（父任务 + 子任务）
3. 按依赖关系设置优先级

### 跨技能协作

- **git-tools 完成后**：记录进度到相关任务
- **vercel:deploy 完成后**：记录部署并完成相关任务
- **brainstorming 结束后**：将结论转化为任务层级

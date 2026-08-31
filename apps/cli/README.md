# ai-todo-cli

CLI tool for AI agents to interact with [ai-todo](https://ai-todo.stringzhao.life).

All commands are dynamically discovered from the server. All output is JSON.

## Install

```bash
npm install -g ai-todo-cli
```

## Login

```bash
ai-todo login
```

For headless environments:

```bash
ai-todo login --token <jwt>
```

## Usage

```bash
ai-todo tasks:list
ai-todo tasks:list --filter today
ai-todo tasks:create --title "Review PR" --priority 1
ai-todo tasks:complete --id <task-id>
ai-todo tasks:delete --id <task-id>
ai-todo tasks:add-log --id <task-id> --content "Done with phase 1"
ai-todo spaces:list
```

Run `ai-todo --help` to see all available commands (fetched from server).

## Release

This package lives in the [ai-todo monorepo](https://github.com/strzhao/ai-todo) under `apps/cli` and is published to npm via GitHub Actions when a tag like `cli-v0.4.4` is pushed.

```bash
# 在 monorepo 根目录执行
npm version patch --workspace ai-todo-cli --no-git-tag-version
git add apps/cli/package.json package-lock.json
git commit -m "chore(cli): release v0.4.4"
git tag cli-v0.4.4
git push origin main && git push origin cli-v0.4.4
```

The workflow will verify that the Git tag matches `apps/cli/package.json` before publishing.

## For AI Agents

This CLI is designed for AI agent integration. Key features:

- All output is structured JSON
- Exit codes: 0 = success, 1 = error, 2 = auth required
- Commands are dynamically loaded from `/api/manifest`
- No interactive prompts — all input via flags

## License

MIT

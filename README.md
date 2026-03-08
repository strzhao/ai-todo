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

This package is published to npm via GitHub Actions when a tag like `v0.1.3` is pushed.

```bash
npm version patch
git push origin main --follow-tags
```

The workflow will verify that the Git tag matches `package.json` before publishing.

## For AI Agents

This CLI is designed for AI agent integration. Key features:

- All output is structured JSON
- Exit codes: 0 = success, 1 = error, 2 = auth required
- Commands are dynamically loaded from `/api/manifest`
- No interactive prompts — all input via flags

## License

MIT

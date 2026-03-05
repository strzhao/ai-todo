import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReadmeTabs } from "@/components/readme-tabs";

/* ─── CLI Tab Content ─── */

const cliExamples = [
  { cmd: "ai-todo login", desc: "浏览器授权登录" },
  { cmd: "ai-todo whoami", desc: "查看当前登录用户" },
  { cmd: "ai-todo tasks:list", desc: "列出所有待办任务" },
  { cmd: "ai-todo tasks:list --filter today", desc: "列出今日任务" },
  { cmd: "ai-todo tasks:create --title '写周报' --priority 1", desc: "创建高优任务" },
  { cmd: "ai-todo tasks:create --title '子任务' --parent_id <id>", desc: "创建子任务" },
  { cmd: "ai-todo tasks:update --id <id> --priority 0", desc: "更新优先级" },
  { cmd: "ai-todo tasks:complete --id <id>", desc: "完成任务" },
  { cmd: "ai-todo tasks:delete --id <id>", desc: "删除任务" },
  { cmd: "ai-todo tasks:add-log --id <id> --content '完成第一阶段'", desc: "添加进展日志" },
  { cmd: "ai-todo spaces:list", desc: "列出所有空间" },
  { cmd: "ai-todo spaces:create --name '项目空间'", desc: "创建空间" },
];

function CLIContent() {
  return (
    <div className="space-y-6">
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader>
          <CardTitle className="text-base">AI-First 设计</CardTitle>
          <CardDescription>
            ai-todo CLI 是为 AI agent 设计的命令行工具。所有输出为结构化 JSON，命令从服务端动态发现，
            旨在让 AI agent 直接管理任务，减少人的介入。人通过 AI agent 间接使用此工具。
          </CardDescription>
        </CardHeader>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">安装</h2>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <code className="block rounded-md bg-muted px-4 py-3 text-sm">
              npm install -g ai-todo-cli
            </code>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Skill 安装（Claude Code）</h2>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <p>在 Claude Code 中安装 ai-todo skill，让 AI agent 自动管理任务：</p>
            <code className="block rounded-md bg-muted px-4 py-3">
              npx skills add stringzhao/ai-todo-cli
            </code>
            <p className="text-muted-foreground">
              安装后，AI agent 会自动识别任务相关意图并调用 ai-todo CLI。
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">认证</h2>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <p>首次使用需要登录，CLI 会打开浏览器完成 OAuth 授权：</p>
            <code className="block rounded-md bg-muted px-4 py-3">ai-todo login</code>
            <p className="text-muted-foreground">
              Headless 环境可直接传入 JWT token：<code className="bg-muted px-1.5 py-0.5 rounded">ai-todo login --token &lt;jwt&gt;</code>
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">动态命令发现</h2>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <p>
              CLI 的所有业务命令从服务端 <code className="bg-muted px-1.5 py-0.5 rounded">/api/manifest</code> 动态获取，
              不写死在客户端。服务端新增能力后，CLI 无需更新即可使用。
            </p>
            <code className="block rounded-md bg-muted px-4 py-3">ai-todo --help</code>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">命令示例</h2>
        <div className="grid gap-2">
          {cliExamples.map((ex) => (
            <div key={ex.cmd} className="flex items-start gap-3 rounded-lg border px-4 py-3">
              <code className="text-sm font-mono shrink-0">{ex.cmd}</code>
              <span className="text-sm text-muted-foreground">{ex.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">AI Agent 集成</h2>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm text-foreground/90">
            <p>
              AI agent（如 Claude Code）可以通过以下方式集成 ai-todo CLI：
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>在 agent 的工具链中注册 <code className="bg-muted px-1.5 py-0.5 rounded">ai-todo</code> 命令</li>
              <li>Agent 调用 <code className="bg-muted px-1.5 py-0.5 rounded">ai-todo tasks:list</code> 获取任务上下文</li>
              <li>Agent 根据用户意图调用对应命令完成任务管理</li>
              <li>所有响应为 JSON，agent 可直接解析</li>
            </ul>
            <p className="text-muted-foreground">
              输出格式：成功返回数据 JSON，错误返回 <code className="bg-muted px-1.5 py-0.5 rounded">{`{"error": "...", "status": N}`}</code>，
              退出码 0=成功 1=错误 2=需登录。
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ─── Doc Tab Content (existing) ─── */

const quickStartSteps = [
  {
    title: "1. 在输入框写一句自然语言",
    desc: "直接描述你想做的事，不用记命令。支持创建、更新、完成、删除、日报。",
  },
  {
    title: "2. 确认 AI 预览",
    desc: "系统会先显示将要执行的操作，确认无误后再执行，避免误改任务。",
  },
  {
    title: "3. 在列表里继续跟进",
    desc: "任务支持内联编辑、标记完成、删除，还可一键置顶到侧边栏升级为项目空间。",
  },
];

const pinningHighlights = [
  {
    title: "置顶：任务秒变空间",
    desc: "在任意顶层任务的「⋮」菜单点「置顶到侧边栏」，该任务会立刻进入「项目空间」。",
  },
  {
    title: "切换：无缝进入协作视角",
    desc: "点侧边栏空间即可进入协作页面，继续用 @成员、成员筛选、甘特图推进任务。",
  },
  {
    title: "取消置顶：空间回归任务",
    desc: "需要收尾时点「取消置顶」，任务和子任务都保留，只是退出空间导航。",
  },
];

const actionExamples = [
  {
    label: "创建任务",
    effect: "创建新任务并自动识别时间、优先级等字段。",
    examples: ["明天下午写周报", "下周一 10 点和产品开需求会"],
  },
  {
    label: "更新任务",
    effect: "定位现有任务并更新优先级、时间或描述。",
    examples: ["把写报告改成高优先级", "把调研任务截止日期改到周五"],
  },
  {
    label: "标记完成",
    effect: "将任务标记为已完成；完成父任务时会同步完成其未完成子任务。",
    examples: ["完成调研任务", "接口联调搞定了"],
  },
  {
    label: "删除任务",
    effect: "删除指定任务；删除父任务会级联删除子任务。",
    examples: ["删除测试任务", "取消本周 mock 数据清理"],
  },
  {
    label: "添加日报",
    effect: "为指定任务追加进展记录，方便后续回顾与同步。",
    examples: ["给项目计划加进展：完成第一阶段", "给接口重构补充进展：单测通过"],
  },
  {
    label: "移动为子任务",
    effect: "把已有任务移动到某父任务下，支持一句话批量移动多个任务。",
    examples: ["把调研任务移到项目计划下面", "把接口联调、联调复盘都挪到发布准备下面"],
  },
];

const collaborationTips = [
  "任意顶层任务都支持置顶/取消置顶，可在「任务管理」和「项目空间」间快速切换。",
  "在项目空间中输入 `@成员邮箱` 可直接指派任务。",
  "空间页支持按成员筛选任务，快速看各自负责项。",
  "切换到甘特图可查看时间分布，点任务可回到列表定位。",
  "侧边栏空间与任务数据是同一份，切换视角不会造成信息割裂。",
];

const efficiencyTips = [
  "按 `Cmd/Ctrl + K` 可随时聚焦 AI 输入框。",
  "按 `Cmd/Ctrl + Enter` 快速触发解析与预览。",
  "在空间中聚焦父任务后输入，会默认创建该任务的子任务。",
  "遇到复杂需求，拆成多句输入，确认预览后分步执行更稳。",
];

const faqs = [
  {
    q: "AI 解析失败怎么办？",
    a: "先检查输入是否包含明确动作和目标任务；可换成更短、更直接的表达后重试。",
  },
  {
    q: "为什么要先看预览再执行？",
    a: "预览是防误操作机制。尤其是更新、删除类操作，确认后再执行更安全。",
  },
  {
    q: "提示未登录或会话失效怎么办？",
    a: "按页面提示重新登录即可。登录后会回到原来的页面继续操作。",
  },
  {
    q: "完成父任务会发生什么？",
    a: "系统会把该父任务下所有未完成子任务一起标记为已完成，确保状态一致。",
  },
  {
    q: "置顶和新建空间是什么关系？",
    a: "空间本质上是置顶后的顶层任务。你可以先建任务再置顶，也可以直接创建空间，后续体验一致。",
  },
];

function DocContent() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">开箱即用</CardTitle>
            <CardDescription>复制任一示例到输入框，先预览，再执行。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <code className="rounded-md bg-muted px-3 py-2">明天下午写周报</code>
            <code className="rounded-md bg-muted px-3 py-2">把写报告改成高优先级</code>
            <code className="rounded-md bg-muted px-3 py-2">把调研任务、接口联调移到项目计划下面</code>
            <code className="rounded-md bg-muted px-3 py-2">给项目计划加进展：完成第一阶段</code>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">30 秒上手</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {quickStartSteps.map((step) => (
            <Card key={step.title}>
              <CardHeader className="gap-1">
                <CardTitle className="text-sm">{step.title}</CardTitle>
                <CardDescription>{step.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">亮点功能：任务与空间无缝切换</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {pinningHighlights.map((item) => (
            <Card key={item.title}>
              <CardHeader className="gap-1">
                <CardTitle className="text-sm">{item.title}</CardTitle>
                <CardDescription>{item.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">AI 输入示例速查</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {actionExamples.map((item) => (
            <Card key={item.label}>
              <CardHeader className="gap-2">
                <Badge variant="outline">{item.label}</Badge>
                <CardDescription>{item.effect}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {item.examples.map((example) => (
                  <code key={example} className="rounded-md bg-muted px-3 py-2 text-sm">
                    {example}
                  </code>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">项目空间协作</h2>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm text-foreground/90">
            {collaborationTips.map((tip) => (
              <p key={tip}>• {tip}</p>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">高效习惯</h2>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm text-foreground/90">
            {efficiencyTips.map((tip) => (
              <p key={tip}>• {tip}</p>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">常见问题</h2>
        <div className="grid gap-3">
          {faqs.map((faq) => (
            <Card key={faq.q}>
              <CardHeader className="gap-1">
                <CardTitle className="text-sm">{faq.q}</CardTitle>
                <CardDescription>{faq.a}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ─── Page ─── */

export default function ReadmePage() {
  return (
    <div className="app-content space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">使用文档</h1>
          <p className="text-sm text-muted-foreground">
            ai-todo 是为 AI agent 设计的任务管理工具，CLI 是核心接口。
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/">返回任务首页</Link>
        </Button>
      </div>

      <ReadmeTabs
        cliContent={<CLIContent />}
        docContent={<DocContent />}
      />
    </div>
  );
}

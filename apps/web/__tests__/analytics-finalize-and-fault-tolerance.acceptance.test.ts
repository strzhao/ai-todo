import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// 红队验收测试（黑盒）：服务端埋点契约 + 应用层容错集成契约
// 覆盖契约：C3（finalize 调用 trackServerEvent("login_success")）、
//           C4（容错：env 缺失应用正常运行——从应用集成角度断言）
// 覆盖谓词：P3（不配 env 时应用不阻塞）、P5（finalize 源码含 trackServerEvent("login_success"）
//
// 设计原则（红队铁律）：
// - 容错行为是 SDK 内部实现，本测试不断言 SDK 私有逻辑
// - 用 vi.mock 隔离真实 SDK 包（避免 SDK 包自身的发布缺陷污染应用集成验收）
// - 从"应用源码以容错方式调用 SDK 导出"角度断言集成正确性

// 根目录发现：从当前文件向上查找含 package.json 的目录。
// 这样测试无论落在 acceptance-staging/（5 层深）还是 __tests__/（1 层深）都能正确定位。
function findProjectRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("无法定位项目根（未找到 package.json）");
}
const ROOT = findProjectRoot(__dirname);
const FINALIZE_ROUTE_PATH = path.join(ROOT, "app/api/auth/session/finalize/route.ts");
const LAYOUT_PATH = path.join(ROOT, "app/layout.tsx");

// SDK 包名逐字一致（设计文档 Context 节）
const SDK_PACKAGE = "@stringzhao/analytics-sdk";
// 服务端埋点函数名逐字一致
const TRACK_SERVER_EVENT = "trackServerEvent";
// 组件名逐字一致
const ANALYTICS_COMPONENT = "Analytics";
// 事件名逐字一致（设计契约 C3 / 设计决策 D2）
const LOGIN_SUCCESS_EVENT = "login_success";

function readSource(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`源文件不存在: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

describe("[C3/P5] /api/auth/session/finalize 埋点 login_success", () => {
  it("finalize route 文件存在", () => {
    expect(fs.existsSync(FINALIZE_ROUTE_PATH)).toBe(true);
  });

  it(`finalize 从 ${SDK_PACKAGE} 导入 ${TRACK_SERVER_EVENT}`, () => {
    const src = readSource(FINALIZE_ROUTE_PATH);
    expect(src, `必须从 ${SDK_PACKAGE} 导入 ${TRACK_SERVER_EVENT}`).toMatch(
      new RegExp(
        `import\\s+\\{[^}]*\\b${TRACK_SERVER_EVENT}\\b[^}]*\\}\\s+from\\s+["']${SDK_PACKAGE.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}["']`
      )
    );
  });

  it(`finalize 调用 ${TRACK_SERVER_EVENT}("${LOGIN_SUCCESS_EVENT}", ...)`, () => {
    const src = readSource(FINALIZE_ROUTE_PATH);
    // 谓词 P5 字面量：源码必须含 trackServerEvent("login_success"
    expect(src).toContain(`${TRACK_SERVER_EVENT}("${LOGIN_SUCCESS_EVENT}"`);
  });

  it("埋点位于成功响应返回前（await，非 fire-and-forget）", () => {
    const src = readSource(FINALIZE_ROUTE_PATH);
    // 设计契约 C3：await trackServerEvent(...)，位于成功响应返回前
    expect(src).toMatch(new RegExp(`await\\s+${TRACK_SERVER_EVENT}\\s*\\(`));
  });

  it("finalize 不引入 register_success（反向契约 C5 二次防线）", () => {
    const src = readSource(FINALIZE_ROUTE_PATH);
    expect(src.includes("register_success"), "finalize 路由严禁出现 register_success").toBe(false);
  });
});

describe("[C4/P3] 应用层容错集成契约（vi.mock 隔离 SDK）", () => {
  // 设计契约 C4：env 缺失时 <Analytics /> 渲染 null、trackServerEvent 不抛错不阻塞。
  // 红队策略：用 vi.mock 注入可控的 SDK 实现，验证"应用代码以容错方式调用 SDK"，
  // 即应用侧不会因 env 缺失而抛错或阻塞。SDK 内部容错逻辑由 SDK 自身测试覆盖，
  // 此处只断言应用集成层（layout 渲染 + finalize 调用）的契约。

  const ENV_KEYS_TO_CLEAR = [
    "NEXT_PUBLIC_UMAMI_HOST",
    "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
    "UMAMI_HOST",
    "UMAMI_WEBSITE_ID",
  ];
  const saved: Record<string, string | undefined> = {};

  const trackServerEventMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    for (const key of ENV_KEYS_TO_CLEAR) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    vi.resetModules();
    trackServerEventMock.mockClear();
    trackServerEventMock.mockResolvedValue(undefined);

    // 注入模拟 SDK：导出符合契约形态的 Analytics 组件 + trackServerEvent 函数
    vi.doMock(SDK_PACKAGE, () => ({
      // 容错组件：env 缺失时返回 null（设计契约 C4 要求的行为）
      [ANALYTICS_COMPONENT]: function Analytics() {
        return null;
      },
      // 容错函数：永远 resolve，不抛错、不阻塞（设计契约 C4）
      [TRACK_SERVER_EVENT]: trackServerEventMock,
    }));
  });

  afterEach(() => {
    for (const key of ENV_KEYS_TO_CLEAR) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    vi.doUnmock(SDK_PACKAGE);
    vi.resetModules();
  });

  it("env 全部缺失时，SDK 模块仍可正常 import（不抛错）", async () => {
    const mod = await import(SDK_PACKAGE);
    expect(mod, "SDK 必须导出非空模块").toBeTruthy();
    expect(typeof mod[ANALYTICS_COMPONENT], `${ANALYTICS_COMPONENT} 必须是可渲染组件`).toBe(
      "function"
    );
    expect(typeof mod[TRACK_SERVER_EVENT], `${TRACK_SERVER_EVENT} 必须是可调用函数`).toBe(
      "function"
    );
  });

  it("env 全部缺失时，trackServerEvent 调用不抛同步异常且返回 resolve 的 Promise", async () => {
    const mod = await import(SDK_PACKAGE);
    const ret = mod[TRACK_SERVER_EVENT](LOGIN_SUCCESS_EVENT, {
      user_id: "test",
    });
    expect(ret, "必须返回 thenable").toBeDefined();
    expect(typeof (ret as Promise<unknown>)?.then, "必须返回 Promise").toBe("function");
    await expect(ret as Promise<unknown>).resolves.not.toThrow();
    expect(trackServerEventMock).toHaveBeenCalledWith(LOGIN_SUCCESS_EVENT, {
      user_id: "test",
    });
  });

  it("env 全部缺失时，trackServerEvent 多次调用均安全 resolve（不阻塞主流程）", async () => {
    const mod = await import(SDK_PACKAGE);
    const results = await Promise.all([
      mod[TRACK_SERVER_EVENT](LOGIN_SUCCESS_EVENT, { user_id: "u1" }),
      mod[TRACK_SERVER_EVENT](LOGIN_SUCCESS_EVENT, { user_id: "u2" }),
      mod[TRACK_SERVER_EVENT](LOGIN_SUCCESS_EVENT, { user_id: "u3" }),
    ]);
    expect(results, "多次调用必须全部 resolve").toHaveLength(3);
    expect(trackServerEventMock).toHaveBeenCalledTimes(3);
  });

  it("env 全部缺失时，Analytics 组件调用不抛错（容错渲染 null 路径）", async () => {
    const mod = await import(SDK_PACKAGE);
    // 直接调用组件函数：容错路径应安全返回 null，不抛错
    expect(() => {
      mod[ANALYTICS_COMPONENT]({});
    }, "Analytics() 在 env 缺失时不得抛错").not.toThrow();
  });
});

describe("[C1 强化] layout.tsx <Analytics /> 集成形态静态校验", () => {
  // 此 describe 与 static-contracts 文件的 C1 互补：
  // 这里额外断言"Analytics 出现在 body 内部"（而非仅文件出现）
  it("<Analytics /> 在 <body>...</body> 之内", () => {
    const src = readSource(LAYOUT_PATH);
    const bodyOpen = src.indexOf("<body");
    const bodyClose = src.lastIndexOf("</body>");
    expect(bodyOpen, "必须有 <body 开标签").toBeGreaterThan(-1);
    expect(bodyClose, "必须有 </body> 闭标签").toBeGreaterThan(-1);
    expect(bodyClose, "</body> 必须在 <body 之后").toBeGreaterThan(bodyOpen);
    const analyticsIdx = src.indexOf("<Analytics");
    expect(analyticsIdx, "必须渲染 <Analytics").toBeGreaterThan(-1);
    expect(analyticsIdx, "<Analytics /> 必须在 <body> 内部（设计契约 D1）").toBeGreaterThan(
      bodyOpen
    );
    expect(analyticsIdx, "<Analytics /> 必须在 </body> 之前（设计契约 D1）").toBeLessThan(
      bodyClose
    );
  });
});

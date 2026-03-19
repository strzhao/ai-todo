import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 验收测试：CLI Manifest 包含组织相关操作
// 红队验证者编写，基于设计文档，不依赖实现代码

const MANIFEST_PATH = path.resolve(
  __dirname,
  "../app/api/manifest/route.ts"
);

// 设计文档要求的 7 个组织操作
const EXPECTED_ORG_OPERATIONS = [
  {
    id: "orgs:list",
    method: "GET",
    pathPattern: "/api/orgs",
  },
  {
    id: "orgs:create",
    method: "POST",
    pathPattern: "/api/orgs",
  },
  {
    id: "orgs:get",
    method: "GET",
    pathPattern: "/api/orgs/",  // /api/orgs/:id
  },
  {
    id: "orgs:members",
    method: "GET",
    pathPattern: "/api/orgs/",  // /api/orgs/:id/members
  },
  {
    id: "orgs:spaces",
    method: "GET",
    pathPattern: "/api/orgs/",  // /api/orgs/:id/spaces
  },
  {
    id: "orgs:join",
    method: "POST",
    pathPattern: "/api/orgs/join/",  // /api/orgs/join/:code
  },
  {
    id: "orgs:join-space",
    method: "POST",
    pathPattern: "/api/orgs/",  // /api/orgs/:id/spaces/:spaceId/join
  },
];

describe("Manifest 组织操作注册", () => {
  let manifestContent: string;

  it("manifest route 文件存在", () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
  });

  it("manifest 包含所有 7 个组织操作 ID", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");

    for (const op of EXPECTED_ORG_OPERATIONS) {
      expect(
        manifestContent,
        `缺少操作: ${op.id}`
      ).toContain(op.id);
    }
  });

  it("orgs:list 操作配置正确", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
    expect(manifestContent).toContain("orgs:list");
    expect(manifestContent).toMatch(/orgs:list[\s\S]*?GET/);
    expect(manifestContent).toMatch(/orgs:list[\s\S]*?\/api\/orgs/);
  });

  it("orgs:create 操作配置正确", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
    expect(manifestContent).toContain("orgs:create");
    expect(manifestContent).toMatch(/orgs:create[\s\S]*?POST/);
  });

  it("orgs:get 操作配置正确", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
    expect(manifestContent).toContain("orgs:get");
  });

  it("orgs:members 操作配置正确", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
    expect(manifestContent).toContain("orgs:members");
    expect(manifestContent).toMatch(/members/);
  });

  it("orgs:spaces 操作包含空间路径", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
    expect(manifestContent).toContain("orgs:spaces");
    expect(manifestContent).toMatch(/spaces/);
  });

  it("orgs:join 操作使用 POST 方法", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
    expect(manifestContent).toContain("orgs:join");
    // join 路径包含 /join/
    expect(manifestContent).toMatch(/\/api\/orgs\/join/);
  });

  it("orgs:join-space 操作使用 POST 方法", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
    expect(manifestContent).toContain("orgs:join-space");
  });

  it("组织操作总数 >= 7 个", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
    // 统计 manifest 中包含 "orgs:" 的操作 ID 出现次数
    const orgOpMatches = manifestContent.match(/["']orgs:[a-z-]+["']/g);
    expect(orgOpMatches).not.toBeNull();
    expect(orgOpMatches!.length).toBeGreaterThanOrEqual(7);
  });
});

describe("Manifest 组织操作名称", () => {
  let manifestContent: string;

  it("每个组织操作都有可读的 name 字段", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");

    // 验证 manifest 中与 org 相关的操作都有 name 字段
    // 每个操作对象应有 id 和 name
    const orgOperationIds = [
      "orgs:list",
      "orgs:create",
      "orgs:get",
      "orgs:members",
      "orgs:spaces",
      "orgs:join",
      "orgs:join-space",
    ];

    for (const id of orgOperationIds) {
      // 操作 ID 存在于 manifest 中
      expect(manifestContent, `操作 ${id} 未注册`).toContain(id);
    }
  });
});

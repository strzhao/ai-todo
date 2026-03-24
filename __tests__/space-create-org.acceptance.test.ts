import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 验收测试：spaces:create 操作支持 org_id 参数
// 红队验证者编写，基于设计文档，不依赖实现代码

const MANIFEST_PATH = path.resolve(
  __dirname,
  "../app/api/manifest/route.ts"
);

describe("spaces:create 支持 org_id 参数", () => {
  let manifestContent: string;

  it("manifest 文件存在", () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");
  });

  it("spaces:create 操作包含 org_id 参数", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");

    // 找到 create_space 操作块
    expect(manifestContent).toContain("create_space");
    expect(manifestContent).toContain("spaces:create");

    // org_id 参数必须在 create_space 操作中存在
    // 提取 create_space 操作附近的内容
    const createSpaceIdx = manifestContent.indexOf("create_space");
    expect(createSpaceIdx).toBeGreaterThan(-1);

    // 从 create_space 到下一个操作块（下一个 id:）的范围内应包含 org_id
    const nextOpIdx = manifestContent.indexOf("id:", createSpaceIdx + 20);
    const createSpaceBlock = manifestContent.slice(createSpaceIdx, nextOpIdx > -1 ? nextOpIdx : undefined);

    expect(createSpaceBlock, "spaces:create 操作缺少 org_id 参数").toContain("org_id");
  });

  it("org_id 参数是可选的（required: false）", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");

    // org_id 在 body 中且非必填
    const createSpaceIdx = manifestContent.indexOf("create_space");
    const nextOpIdx = manifestContent.indexOf("id:", createSpaceIdx + 20);
    const createSpaceBlock = manifestContent.slice(createSpaceIdx, nextOpIdx > -1 ? nextOpIdx : undefined);

    expect(createSpaceBlock).toContain('"body"');
    // org_id 行应包含 required: false
    const orgIdLineIdx = createSpaceBlock.indexOf("org_id");
    const orgIdContext = createSpaceBlock.slice(orgIdLineIdx, orgIdLineIdx + 200);
    expect(orgIdContext).toMatch(/required:\s*false/);
  });

  it("org_id 参数类型为 string", () => {
    manifestContent = fs.readFileSync(MANIFEST_PATH, "utf-8");

    const createSpaceIdx = manifestContent.indexOf("create_space");
    const nextOpIdx = manifestContent.indexOf("id:", createSpaceIdx + 20);
    const createSpaceBlock = manifestContent.slice(createSpaceIdx, nextOpIdx > -1 ? nextOpIdx : undefined);

    const orgIdLineIdx = createSpaceBlock.indexOf("org_id");
    const orgIdContext = createSpaceBlock.slice(orgIdLineIdx, orgIdLineIdx + 200);
    expect(orgIdContext).toMatch(/type:\s*["']string["']/);
  });
});

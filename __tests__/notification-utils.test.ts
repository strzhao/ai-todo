import { describe, it, expect } from "vitest";
import { getNotificationUrl } from "@/lib/notification-utils";

describe("getNotificationUrl", () => {
  it("returns space focus URL when both space_id and task_id are present", () => {
    expect(getNotificationUrl({ space_id: "s1", task_id: "t1" })).toBe("/spaces/s1?focus=t1");
  });

  it("returns space URL when only space_id is present", () => {
    expect(getNotificationUrl({ space_id: "s1" })).toBe("/spaces/s1");
  });

  it("returns home focus URL when only task_id is present", () => {
    expect(getNotificationUrl({ task_id: "t1" })).toBe("/?focus=t1");
  });

  it("returns root when neither space_id nor task_id is present", () => {
    expect(getNotificationUrl({})).toBe("/");
  });

  it("returns root when both are undefined", () => {
    expect(getNotificationUrl({ space_id: undefined, task_id: undefined })).toBe("/");
  });
});

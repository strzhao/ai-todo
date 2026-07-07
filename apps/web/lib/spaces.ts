import {
  getTaskMemberRecord,
  getTaskById,
  getOrgMemberRecord,
  getTaskMembers,
  getOrgMembers,
} from "./db";
import type { TaskMember } from "./types";

export async function getSpaceMember(spaceId: string, userId: string): Promise<TaskMember | null> {
  // 1. 先查直接成员
  const direct = await getTaskMemberRecord(spaceId, userId);
  if (direct && direct.status === "active") return direct;

  // 2. 检查空间是否有 org_id
  const space = await getTaskById(spaceId);
  if (!space || !space.org_id) return null;

  // 3. 检查用户是否是该 org 的 active 成员
  const orgMember = await getOrgMemberRecord(space.org_id, userId);
  if (!orgMember || orgMember.status !== "active") return null;

  // 4. 构造虚拟 TaskMember（org 成员自动获得 member 角色）
  return {
    id: `org-virtual-${orgMember.user_id}`,
    task_id: spaceId,
    user_id: orgMember.user_id,
    email: orgMember.email,
    nickname: orgMember.nickname,
    role: "member",
    status: "active",
    joined_at: orgMember.joined_at,
  };
}

// Throws with { status, message } if user is not an active member
export async function requireSpaceMember(spaceId: string, userId: string): Promise<TaskMember> {
  const member = await getSpaceMember(spaceId, userId);
  if (!member) {
    throw Object.assign(new Error("Not a space member"), { status: 403 });
  }
  return member;
}

// Throws with { status, message } if user is not the owner
export async function requireSpaceOwner(spaceId: string, userId: string): Promise<void> {
  const member = await getTaskMemberRecord(spaceId, userId);
  if (!member || member.role !== "owner") {
    throw Object.assign(new Error("Only space owner can perform this action"), { status: 403 });
  }
}

// Throws with { status, message } if user is not admin or owner
export async function requireSpaceAdminOrOwner(
  spaceId: string,
  userId: string
): Promise<TaskMember> {
  const member = await getTaskMemberRecord(spaceId, userId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw Object.assign(new Error("Requires admin or owner role"), { status: 403 });
  }
  return member;
}

export async function getAllSpaceMembers(spaceId: string): Promise<TaskMember[]> {
  const directMembers = await getTaskMembers(spaceId);

  const space = await getTaskById(spaceId);
  if (!space || !space.org_id) return directMembers;

  const orgMembers = await getOrgMembers(space.org_id);
  const activeOrgMembers = orgMembers.filter((om) => om.status === "active");

  const directUserIds = new Set(directMembers.map((m) => m.user_id));

  const virtualMembers: TaskMember[] = activeOrgMembers
    .filter((om) => !directUserIds.has(om.user_id))
    .map((om) => ({
      id: `org-virtual-${om.user_id}`,
      task_id: spaceId,
      user_id: om.user_id,
      email: om.email,
      nickname: om.nickname,
      role: "member" as const,
      status: "active" as const,
      joined_at: om.joined_at,
    }));

  return [...directMembers, ...virtualMembers];
}

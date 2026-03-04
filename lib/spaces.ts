import { getTaskMemberRecord } from "./db";
import type { TaskMember } from "./types";

export async function getSpaceMember(spaceId: string, userId: string): Promise<TaskMember | null> {
  return getTaskMemberRecord(spaceId, userId);
}

// Throws with { status, message } if user is not an active member
export async function requireSpaceMember(spaceId: string, userId: string): Promise<TaskMember> {
  const member = await getTaskMemberRecord(spaceId, userId);
  if (!member || member.status !== "active") {
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

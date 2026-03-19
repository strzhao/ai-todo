import { getOrgMemberRecord } from "./db";
import type { OrgMember } from "./types";

export async function getOrgMember(orgId: string, userId: string): Promise<OrgMember | null> {
  return getOrgMemberRecord(orgId, userId);
}

// Throws with { status, message } if user is not an active member
export async function requireOrgMember(orgId: string, userId: string): Promise<OrgMember> {
  const member = await getOrgMemberRecord(orgId, userId);
  if (!member || member.status !== "active") {
    throw Object.assign(new Error("Not an organization member"), { status: 403 });
  }
  return member;
}

// Throws with { status, message } if user is not the owner
export async function requireOrgOwner(orgId: string, userId: string): Promise<void> {
  const member = await getOrgMemberRecord(orgId, userId);
  if (!member || member.role !== "owner") {
    throw Object.assign(new Error("Only organization owner can perform this action"), { status: 403 });
  }
}

// Throws with { status, message } if user is not admin or owner
export async function requireOrgAdminOrOwner(orgId: string, userId: string): Promise<OrgMember> {
  const member = await getOrgMemberRecord(orgId, userId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw Object.assign(new Error("Requires admin or owner role"), { status: 403 });
  }
  return member;
}

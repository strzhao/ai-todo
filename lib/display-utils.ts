/**
 * 统一用户显示名称工具函数
 * 优先级：display_name（空间内自定义）> nickname（全局昵称）> email 本地部分
 */
export function getDisplayLabel(
  email: string,
  member?: { display_name?: string; nickname?: string },
): string {
  return member?.display_name || member?.nickname || email.split("@")[0];
}

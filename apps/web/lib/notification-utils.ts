/**
 * Compute the navigation URL for a notification based on its space_id and task_id.
 * Used by NotificationItem (client) and push payload builder (server).
 */
export function getNotificationUrl(n: { task_id?: string; space_id?: string }): string {
  if (n.space_id && n.task_id) return `/spaces/${n.space_id}?focus=${n.task_id}`;
  if (n.space_id) return `/spaces/${n.space_id}`;
  if (n.task_id) return `/?focus=${n.task_id}`;
  return `/`;
}

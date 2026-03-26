import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  description: z.string().optional(),
  due_date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  tags: z.array(z.string()).optional(),
  type: z.union([z.literal(0), z.literal(1)]).optional(),
  assignee: z.string().optional(),
  assignee_email: z.string().optional(),
  mentions: z.array(z.string()).optional(),
  space_id: z.string().optional(),
  parent_id: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  parent_target_id: z.string().optional(),
  parent_target_title: z.string().optional(),
});

/** Format zod errors into a single readable message */
export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((i) => {
    const path = i.path.length ? `${i.path.join(".")}: ` : "";
    return `${path}${i.message}`;
  });
  return issues.join("; ");
}

import { z } from "zod";

/**
 * #4 E.7 — section validation, shared by the admin action (`saveSection`)
 * and the public API routes. Single validation boundary: the API never forks
 * its own rules (see linkSchema / profileCoreShape for the same pattern).
 */

export const sectionSchema = z.object({
  id: z.coerce.number().optional(),
  pageId: z.coerce.number(),
  title: z.string().min(1, "Title is required").max(80),
  // Dashed lucide icon name ("shopping-bag"), or empty → null. Values that
  // aren't valid icon names (e.g. legacy emoji) are rejected on save.
  icon: z
    .string()
    .trim()
    .max(48)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid icon name")
    .optional()
    .nullable(),
});

/**
 * API PUT /api/v1/sections/:id — data-exact partial update: every PRESENT
 * field must satisfy the same rules as the admin form; absent fields are
 * untouched; an empty body is a no-op.
 */
export const sectionPatchSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(80).optional(),
    icon: z
      .string()
      .trim()
      .max(48)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid icon name")
      .optional()
      .nullable(),
    orderIndex: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

/**
 * OpenAPI 3.1 document for the public REST API (#4) — programmatic builder,
 * pure module (no db). Served auth-gated at /api/v1/openapi(.json); rendered
 * by /api/v1/docs.
 *
 * The drift test (src/lib/__tests__/openapi.test.ts) parses the actual route
 * files under src/app/api/v1 (every route.ts) and asserts exact set-equality
 * with the paths/methods documented here — in BOTH directions, so an
 * endpoint can never ship undocumented and the spec can never advertise a
 * route that does not exist.
 */
import { version } from "@/lib/version";

type Json = Record<string, unknown>;

const errorRef = { $ref: "#/components/schemas/ErrorEnvelope" };

function errorResponse(description: string): Json {
  return { description, content: { "application/json": { schema: errorRef } } };
}

const standardErrors: Json = {
  "400": errorResponse("Validation error (error.code=validation, details[] pinpoints fields)"),
  "401": errorResponse("Missing, malformed, unknown or revoked API key"),
  "403": errorResponse("Demo mode: instance is read-only (error.code=demo)"),
  "429": errorResponse("Rate limit exceeded (Retry-After header; error.code=rate_limit)"),
  "500": errorResponse("Internal error (never leaks details)"),
};

/** Build the full OpenAPI 3.1 document. */
export function buildOpenApiDocument(): Json {
  return {
    openapi: "3.1.0",
    info: {
      title: "LinkBreeze API",
      version,
      description:
        "Public REST API for programmatic link management. Authenticate with an " +
        "API key generated in Settings > Security (Authorization: Bearer <key>). " +
        "Success responses are { data }; errors are { error: { code, message, details? } }. " +
        "Rate limit: 120 requests/minute per key (plus a per-IP pre-auth guard). " +
        "Mutating endpoints are blocked in demo mode.",
    },
    servers: [{ url: "/" }],
    tags: [{ name: "links" }, { name: "profile" }, { name: "analytics" }, { name: "meta" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "lbk_*" },
      },
      schemas: {
        ErrorEnvelope: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "validation",
                    "unauthorized",
                    "forbidden",
                    "demo",
                    "rate_limit",
                    "not_found",
                    "conflict",
                    "internal",
                  ],
                },
                message: { type: "string" },
                details: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { path: { type: "string" }, message: { type: "string" } },
                  },
                },
              },
            },
          },
        },
        Link: {
          type: "object",
          required: ["id", "title", "url", "type"],
          properties: {
            id: { type: "integer" },
            pageId: { type: "integer" },
            sectionId: { type: ["integer", "null"] },
            orderIndex: { type: "integer" },
            type: {
              type: "string",
              enum: [
                "url", "email", "phone", "whatsapp", "sms", "vcard",
                "file", "embed", "text", "location", "divider",
              ],
            },
            title: { type: "string", maxLength: 120 },
            description: { type: ["string", "null"], maxLength: 300 },
            url: { type: "string", maxLength: 2048 },
            icon: { type: ["string", "null"] },
            iconUrl: { type: ["string", "null"] },
            customIconUrl: { type: ["string", "null"] },
            iconMode: { type: "string", enum: ["auto", "lucide", "custom"] },
            autoIcon: { type: "boolean" },
            imageUrl: { type: ["string", "null"] },
            isHighlighted: { type: "boolean" },
            isActive: { type: "boolean" },
            scheduleStart: { type: ["string", "null"] },
            scheduleEnd: { type: ["string", "null"] },
            clicksCount: { type: "integer" },
            cardStyle: { type: "string", enum: ["compact", "rich"] },
            popupText: { type: ["string", "null"], maxLength: 5000 },
            ctaLabel: { type: ["string", "null"], maxLength: 80 },
            redirectSlug: { type: ["string", "null"] },
            createdAt: { type: "string" },
          },
        },
        LinkCreate: {
          type: "object",
          required: ["title", "url"],
          description:
            "Create a link. Same validation as the admin UI: per-type URL scheme " +
            "allowlist, optional /go/ redirectSlug (unique), iconMode lucide needs a " +
            "known icon name; iconMode custom is API-rejected. Unknown fields are " +
            "ignored - the id is always server-assigned.",
          properties: {
            title: { type: "string", minLength: 1, maxLength: 120 },
            url: { type: "string", maxLength: 2048 },
            pageId: { type: "integer" },
            description: { type: ["string", "null"], maxLength: 300 },
            imageUrl: { type: ["string", "null"] },
            type: { type: "string" },
            popupText: { type: ["string", "null"], maxLength: 5000 },
            ctaLabel: { type: ["string", "null"], maxLength: 80 },
            isHighlighted: { type: "boolean" },
            isActive: { type: "boolean" },
            scheduleStart: { type: ["string", "null"] },
            scheduleEnd: { type: ["string", "null"] },
            autoIcon: { type: "boolean" },
            iconMode: { type: "string", enum: ["auto", "lucide"] },
            icon: { type: ["string", "null"] },
            cardStyle: { type: "string", enum: ["compact", "rich"] },
            sectionId: { type: ["integer", "null"] },
            redirectSlug: { type: ["string", "null"], maxLength: 200 },
          },
        },
        LinkUpdate: {
          type: "object",
          description:
            "Partial update: keys present are written (null clears nullable fields), " +
            "keys absent are unchanged. The merged result is revalidated as a whole. " +
            "pageId is create-only; id/userId/createdAt/clicksCount are never writable.",
          properties: {
            title: { type: "string", minLength: 1, maxLength: 120 },
            url: { type: "string", maxLength: 2048 },
            description: { type: ["string", "null"], maxLength: 300 },
            imageUrl: { type: ["string", "null"] },
            type: { type: "string" },
            popupText: { type: ["string", "null"], maxLength: 5000 },
            ctaLabel: { type: ["string", "null"], maxLength: 80 },
            isHighlighted: { type: "boolean" },
            isActive: { type: "boolean" },
            scheduleStart: { type: ["string", "null"] },
            scheduleEnd: { type: ["string", "null"] },
            autoIcon: { type: "boolean" },
            iconMode: { type: "string", enum: ["auto", "lucide"] },
            icon: { type: ["string", "null"] },
            cardStyle: { type: "string", enum: ["compact", "rich"] },
            sectionId: { type: ["integer", "null"] },
            redirectSlug: { type: ["string", "null"], maxLength: 200 },
          },
        },
        LinkReorder: {
          type: "object",
          required: ["ids"],
          properties: {
            ids: {
              type: "array",
              items: { type: "integer" },
              minItems: 1,
              maxItems: 1000,
              description: "Link ids in their new display order (unique, positive).",
            },
          },
        },
        SocialLink: {
          type: "object",
          required: ["platform", "url"],
          properties: {
            platform: { type: "string" },
            url: { type: "string", minLength: 1, maxLength: 2048 },
          },
        },
        Profile: {
          type: "object",
          required: ["displayName"],
          properties: {
            displayName: { type: "string", minLength: 1, maxLength: 80 },
            bio: { type: "string", maxLength: 300 },
            badgeText: { type: ["string", "null"], maxLength: 40 },
            avatarUrl: { type: ["string", "null"] },
            socialLinks: { type: "array", items: { $ref: "#/components/schemas/SocialLink" } },
          },
        },
        Analytics: {
          type: "object",
          required: ["range", "since", "exportedAt", "retentionDays"],
          properties: {
            range: { type: "string", enum: ["7d", "30d", "90d"] },
            since: { type: "string", description: "ISO start of the reported window" },
            exportedAt: { type: "string" },
            retentionDays: {
              type: "integer",
              description: "Analytics retention window (0 = keep forever)",
            },
            totalViews: { type: "integer" },
            uniqueVisitors: { type: "integer" },
            totalClicks: { type: "integer" },
            ctr: { type: "number" },
            topLinks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  title: { type: "string" },
                  clicks: { type: "integer" },
                },
              },
            },
            viewsPerDay: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string" },
                  views: { type: "integer" },
                  clicks: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v1/links": {
        get: {
          tags: ["links"],
          summary: "List links (full list by default; cursor-paginated with ?limit)",
          description:
            "Without parameters: the full array in `data` (legacy contract). " +
            "With `limit` and/or `cursor`: one keyset page — `data` plus " +
            "`meta: { count, nextCursor }` (nextCursor is an opaque string or null " +
            "on the last page; the walk order is display order). `fields` returns " +
            "sparse rows (id is always included).",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 100 },
              description: "Page size; activating pagination switches the shape to { data, meta }.",
            },
            {
              name: "cursor",
              in: "query",
              schema: { type: "string" },
              description: "Opaque cursor from a previous meta.nextCursor (defaults to limit=100 when used alone).",
            },
            {
              name: "fields",
              in: "query",
              schema: { type: "string" },
              description:
                "Comma-separated sparse fieldset, e.g. `fields=title,url,clicksCount` " +
                "(id always included; unknown names are a 400).",
            },
          ],
          responses: {
            "200": {
              description: "All links (no params) or one page (with limit/cursor)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Link" } },
                      meta: {
                        type: "object",
                        properties: {
                          count: { type: "integer" },
                          nextCursor: { type: ["string", "null"] },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...standardErrors,
          },
        },
        post: {
          tags: ["links"],
          summary: "Create a link",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/LinkCreate" } },
            },
          },
          responses: {
            "201": {
              description: "Created link",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { $ref: "#/components/schemas/Link" } },
                  },
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/api/v1/links/{id}": {
        put: {
          tags: ["links"],
          summary: "Partially update a link",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/LinkUpdate" } },
            },
          },
          responses: {
            "200": {
              description: "Updated link",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { $ref: "#/components/schemas/Link" } },
                  },
                },
              },
            },
            "404": errorResponse("Link not found"),
            ...standardErrors,
          },
        },
        delete: {
          tags: ["links"],
          summary: "Delete a link",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            "200": {
              description: "Deleted",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: { deleted: { type: "boolean" } },
                      },
                    },
                  },
                },
              },
            },
            "404": errorResponse("Link not found"),
            ...standardErrors,
          },
        },
      },
      "/api/v1/links/reorder": {
        put: {
          tags: ["links"],
          summary: "Reorder links",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/LinkReorder" } },
            },
          },
          responses: {
            "200": {
              description: "Reordered",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: { reordered: { type: "integer" } },
                      },
                    },
                  },
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/api/v1/profile": {
        get: {
          tags: ["profile"],
          summary: "Get the profile",
          responses: {
            "200": {
              description: "Profile",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { $ref: "#/components/schemas/Profile" } },
                  },
                },
              },
            },
            "404": errorResponse("Profile not created yet (set displayName via PUT)"),
            ...standardErrors,
          },
        },
        put: {
          tags: ["profile"],
          summary: "Update the profile (partial, tri-state like links)",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Profile" } },
            },
          },
          responses: {
            "200": {
              description: "Updated profile",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { $ref: "#/components/schemas/Profile" } },
                  },
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/api/v1/analytics": {
        get: {
          tags: ["analytics"],
          summary: "Views, clicks and top links for a range",
          parameters: [
            {
              name: "range",
              in: "query",
              schema: { type: "string", enum: ["7d", "30d", "90d"], default: "7d" },
            },
          ],
          responses: {
            "200": {
              description: "Analytics summary (windowed - check since/retentionDays)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { $ref: "#/components/schemas/Analytics" } },
                  },
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/api/v1/openapi.json": {
        get: {
          tags: ["meta"],
          summary: "This document (alias: /api/v1/openapi)",
          responses: {
            "200": {
              description: "OpenAPI 3.1 document",
              content: { "application/json": { schema: { type: "object" } } },
            },
            ...standardErrors,
          },
        },
      },
      "/api/v1/openapi": {
        get: {
          tags: ["meta"],
          summary: "This document (dotless alias of /api/v1/openapi.json)",
          responses: {
            "200": {
              description: "OpenAPI 3.1 document",
              content: { "application/json": { schema: { type: "object" } } },
            },
            ...standardErrors,
          },
        },
      },
      "/api/v1/docs": {
        get: {
          tags: ["meta"],
          summary: "Minimal human-readable endpoint reference (HTML)",
          responses: {
            "200": {
              description: "HTML docs page",
              content: { "text/html": { schema: { type: "string" } } },
            },
            ...standardErrors,
          },
        },
      },
    },
  };
}

[Made with love by Vercel](https://vercel.com/ "Made with love by Vercel")[Skills](https://www.skills.sh/)

[Topics](https://www.skills.sh/topic) [Official](https://www.skills.sh/official) [Audits](https://www.skills.sh/audits) [Docs](https://www.skills.sh/docs)

[Overview](https://www.skills.sh/docs) [CLI](https://www.skills.sh/docs/cli) [API](https://www.skills.sh/docs/api) [FAQ](https://www.skills.sh/docs/faq) [Customize](https://www.skills.sh/docs/customize)

# API Reference

Programmatic access to the skills.sh skill catalog, leaderboard, and search.

## Base URL

```
https://skills.sh
```

All endpoints are under `/api/v1/` and served over HTTPS. Responses are JSON.

## Authentication

If your app is deployed on Vercel, you can authenticate using the project's OIDC token — no signup, no key to generate. Vercel mints a short-lived JWT per request, scoped to your team and project, and we verify it against `oidc.vercel.com`.

#### 1\. Enable OIDC on your Vercel project

In the Vercel dashboard, open your project →`Settings` → `OIDC Federation` and toggle it on. Vercel will then expose the token at runtime as`process.env.VERCEL_OIDC_TOKEN` and as the`x-vercel-oidc-token` request header.

#### 2\. Install the helper

```
npm install @vercel/oidc
```

`@vercel/oidc` handles request-scoped tokens, local dev token refresh, and expiry correctly. Using it is the recommended path; reading`process.env.VERCEL_OIDC_TOKEN` yourself works too and is shown below.

#### 3\. Call the API from your Vercel app

```
import { getVercelOidcToken } from '@vercel/oidc';

export async function GET() {
  const token = await getVercelOidcToken();

  const res = await fetch('https://skills.sh/api/v1/skills', {
    headers: { Authorization: `Bearer ${token}` },
  });

  return Response.json(await res.json());
}
```

Call `getVercelOidcToken()`inside the request handler — do not hoist it to module scope. The token is rotated roughly every 12 hours and is scoped to the active request context.

#### 4\. Local development

`getVercelOidcToken()` works locally too, as long as the Vercel CLI is linked to your project. The first call uses the token pulled from your Vercel project, and the helper transparently refreshes it when it expires.

```
# one-time, per project
npm i -g vercel
vercel link            # link this directory to a Vercel project
vercel env pull        # writes VERCEL_OIDC_TOKEN into .env.local

# then run your app as usual
npm run dev
```

- `vercel env pull` drops a fresh`VERCEL_OIDC_TOKEN` into `.env.local`. It is valid for ~12 hours.
- If you use `getVercelOidcToken()`, you do not need to keep re-running `vercel env pull`— the async helper auto-refreshes using your CLI credentials. Use`getVercelOidcTokenSync()` only if you cannot await.
- Never commit `.env.local`. The token grants access scoped to your project, but it is still a bearer credential.

#### 5\. Without the helper

If you don't want a dependency, read the env var directly. You lose auto-refresh in local dev, but production behaves the same.

```
// Read fresh per request — do not cache the string
const token = process.env.VERCEL_OIDC_TOKEN;

await fetch('https://skills.sh/api/v1/skills', {
  headers: { Authorization: `Bearer ${token}` },
});
```

For the raw header form (parity with other Vercel services):`x-vercel-oidc-token: <token>`.

#### What we record

Every authenticated request is logged with the`owner_id` (team), `project_id`, and`environment` (`production`,`preview`, or `development`) extracted from the verified token. We never store the raw token.

## Rate limits

| Tier | Limit | Scope |
| --- | --- | --- |
| Authenticated | 600 requests / minute | Per (team, project) |

Rate limit status is returned in every response via headers:

| Field | Type | Description |
| --- | --- | --- |
| X-RateLimit-Limit | integer | Maximum requests allowed in the window. |
| X-RateLimit-Remaining | integer | Requests remaining in the current window. |
| X-RateLimit-Reset | integer | Seconds until the oldest request in the window expires. |

When rate limited, the API returns a`429 Too Many Requests` response with a`Retry-After` header.

## Errors

Error responses follow a consistent shape:

```
{
  "error": "error_code",
  "message": "Human-readable description."
}
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid request parameters. |
| 401 | Missing, invalid, or expired Vercel OIDC token. |
| 404 | Skill not found. |
| 429 | Rate limit exceeded. Retry after the `Retry-After`interval. |
| 503 | Temporarily unavailable. Retry with backoff. |

* * *

## Endpoints

GET

`/api/v1/skills`

Paginated leaderboard of all skills.

GET

`/api/v1/skills/search`

Search skills by name or description.

GET

`/api/v1/skills/curated`

The official curated set of first-party skills.

GET

`/api/v1/skills/{source}/{skill}`

Detailed information about a single skill.

GET

`/api/v1/skills/audit/{source}/{skill}`

Security audit results for a skill.

* * *

GET`/api/v1/skills`

Returns a paginated list of skills from the leaderboard. Supports different views: all-time rankings, trending (recent growth), and hot (comparing the last hour to the same hour yesterday).

### Query parameters

| Parameter | Type | Description |
| --- | --- | --- |
| view | string | "all-time" (default), "trending", or "hot". |
| page | integer | Page number, 0-indexed. Default: 0. |
| per\_page | integer | Results per page, 1-500. Default: 100. |

### Example request

```
curl "https://skills.sh/api/v1/skills?view=trending&per_page=10" \
  -H "Authorization: Bearer $VERCEL_OIDC_TOKEN"
```

### Response

```
{
  "data": [\
    {\
      "id": "vercel-labs/skills/find-skills",\
      "slug": "find-skills",\
      "name": "find-skills",\
      "source": "vercel-labs/skills",\
      "installs": 24531,\
      "sourceType": "github",\
      "installUrl": "https://github.com/vercel-labs/skills",\
      "url": "https://skills.sh/vercel-labs/skills/find-skills"\
    }\
  ],
  "pagination": {
    "page": 0,
    "perPage": 10,
    "total": 8420,
    "hasMore": true
  }
}
```

### Hot view

When `view=hot`, each skill includes additional fields comparing the last hour to the same hour yesterday:

| Field | Type | Description |
| --- | --- | --- |
| installsYesterday | integer | Installs during the same hour yesterday. |
| change | integer | Difference: current hour installs minus yesterday. |

* * *

GET`/api/v1/skills/search`

Search for skills by name, source, or description. Single-word queries use fuzzy matching. Multi-word queries use semantic search for better relevance.

### Query parameters

| Parameter | Type | Description |
| --- | --- | --- |
| q\* | string | Search query. Minimum 2 characters. |
| limit | integer | Maximum results to return, 1-200. Default: 50. |
| owner | string | GitHub owner to search within. Includes skills across all of its repositories. |

### Example request

```
curl "https://skills.sh/api/v1/skills/search?q=react%20native&owner=expo&limit=5" \
  -H "Authorization: Bearer $VERCEL_OIDC_TOKEN"
```

### Response

```
{
  "data": [\
    {\
      "id": "expo/skills/react-native",\
      "slug": "react-native",\
      "name": "React Native",\
      "source": "expo/skills",\
      "installs": 3842,\
      "sourceType": "github",\
      "installUrl": "https://github.com/expo/skills",\
      "url": "https://skills.sh/expo/skills/react-native"\
    }\
  ],
  "query": "react native",
  "searchType": "semantic",
  "count": 5,
  "durationMs": 142
}
```

The `searchType` field indicates whether fuzzy or semantic search was used. Single-word queries return`"fuzzy"`, multi-word queries return`"semantic"`.

* * *

GET`/api/v1/skills/curated`

Returns the official curated set of first-party skills. These are skills from companies and organizations that build the technology the skill is about — "the makers teaching you how to use their product." This is the same dataset shown at [skills.sh/official](https://skills.sh/official).

### Example request

```
curl "https://skills.sh/api/v1/skills/curated" \
  -H "Authorization: Bearer $VERCEL_OIDC_TOKEN"
```

### Response

```
{
  "data": [\
    {\
      "owner": "vercel-labs",\
      "totalInstalls": 89240,\
      "featuredRepo": "skills",\
      "featuredSkill": "find-skills",\
      "skills": [\
        {\
          "id": "vercel-labs/skills/find-skills",\
          "slug": "find-skills",\
          "name": "find-skills",\
          "source": "vercel-labs/skills",\
          "installs": 24531,\
          "sourceType": "github",\
          "installUrl": "https://github.com/vercel-labs/skills",\
          "url": "https://skills.sh/vercel-labs/skills/find-skills"\
        }\
      ]\
    },\
    {\
      "owner": "supabase",\
      "totalInstalls": 12084,\
      "featuredRepo": "supabase",\
      "featuredSkill": "Supabase",\
      "skills": [...]\
    }\
  ],
  "totalOwners": 87,
  "totalSkills": 342,
  "generatedAt": "2026-03-31T08:00:00.000Z"
}
```

Each owner's `skills` array contains the same`V1Skill` shape used across all endpoints, so you can use a single type for all skill objects.

* * *

GET`/api/v1/skills/:source/:skill`

Get a skill's install count and full file tree (SKILL.md and any supporting files).

### Path parameters

The path format depends on the source type:

GitHub skills

```
/api/v1/skills/vercel-labs/skills/find-skills
```

Well-known skills

```
/api/v1/skills/mintlify.com/mintlify
```

Use the `id` field from any listing or search response to construct this path: `/api/v1/skills/{id}`.

### Example request

```
curl "https://skills.sh/api/v1/skills/vercel-labs/skills/find-skills" \
  -H "Authorization: Bearer $VERCEL_OIDC_TOKEN"
```

### Response

```
{
  "id": "vercel-labs/skills/find-skills",
  "source": "vercel-labs/skills",
  "slug": "find-skills",
  "installs": 24531,
  "hash": "a1b2c3d4e5f6...",
  "files": [\
    { "path": "SKILL.md", "contents": "---\nname: Next.js Development\n..." },\
    { "path": "examples/app-router.ts", "contents": "// Example code..." }\
  ]
}
```

### Response fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Stable unique identifier. Format: "{source}/{slug}". |
| source | string | Source repository or provider (e.g., "vercel-labs/skills" or "mintlify.com"). |
| slug | string | URL-safe skill slug (e.g., "next-js-development"). |
| installs | integer | Total deduplicated install count. |
| hash | string \| null | SHA-256 hash of the skill's file contents. Use for cache invalidation or detecting changes without re-fetching files. Null if no snapshot exists. |
| files | array \| null | All files in the skill folder. Each entry has "path" (relative filename) and "contents" (full text). Null if no snapshot exists. |

* * *

GET`/api/v1/skills/audit/:source/:skill`

Get security audit results for a skill from all available partners (Gen Agent Trust Hub, Socket, Snyk, Runlayer, ZeroLeaks).

### Path parameters

The path format depends on the source type (same as the skill detail endpoint):

GitHub skills

```
/api/v1/skills/audit/vercel-labs/skills/find-skills
```

Well-known skills

```
/api/v1/skills/audit/mintlify.com/mintlify
```

Use the `id` field from any listing or search response to construct this path:`/api/v1/skills/audit/{id}`.

### Authentication

Required. Authenticated requests are rate-limited to 600/minper (team, project).

### Example request

```
curl "https://skills.sh/api/v1/skills/audit/vercel-labs/skills/find-skills"
```

### Response

```
{
  "id": "vercel-labs/skills/find-skills",
  "source": "vercel-labs/skills",
  "slug": "find-skills",
  "audits": [\
    {\
      "provider": "Gen Agent Trust Hub",\
      "slug": "agent-trust-hub",\
      "status": "pass",\
      "summary": "No risks detected",\
      "auditedAt": "2026-04-15T12:00:00.000Z",\
      "riskLevel": "LOW"\
    },\
    {\
      "provider": "Socket",\
      "slug": "socket",\
      "status": "pass",\
      "summary": "No alerts",\
      "auditedAt": "2026-04-15T12:05:00.000Z"\
    },\
    {\
      "provider": "Snyk",\
      "slug": "snyk",\
      "status": "pass",\
      "summary": "Risk: LOW · No issues",\
      "auditedAt": "2026-04-15T12:03:00.000Z",\
      "riskLevel": "LOW"\
    }\
  ]
}
```

### Response fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Stable unique identifier. Format: "{source}/{slug}". |
| source | string | Source repository or provider. |
| slug | string | URL-safe skill slug. |
| audits | array | Security audit results from all available partners. See audit entry fields below. |

### Audit entry fields

| Field | Type | Description |
| --- | --- | --- |
| provider | string | Partner display name (e.g., "Gen Agent Trust Hub", "Socket", "Snyk", "Runlayer", "ZeroLeaks"). |
| slug | string | URL-safe partner slug (e.g., "agent-trust-hub", "socket"). Links to the detail page at /owner/repo/skill/security/{slug}. |
| status | string | Normalized verdict: "pass" (safe), "warn" (review recommended), "fail" (likely dangerous). |
| summary | string | One-line human-readable summary of findings. |
| auditedAt | string | ISO 8601 timestamp of when this audit was performed. |
| riskLevel | string | Risk level label: "NONE", "LOW", "MEDIUM", "HIGH", or "CRITICAL". Present for most partners. |
| categories | string\[\] | Detected categories (e.g., \["NO\_CODE", "SAFE"\]). Only present for Agent Trust Hub. |

404 when no audits exist

Returns `404` if no partner has audited this skill yet. Audits are generated automatically after a skill is installed for the first time — there may be a delay of a few minutes.

* * *

## Skill object

Every skill returned by listing and search endpoints has this base shape. The detail endpoint returns a different, minimal shape.

| Field | Type | Description |
| --- | --- | --- |
| id | string | Stable unique identifier. Format: "{source}/{slug}". Use this to construct detail endpoint paths. |
| slug | string | URL-safe skill slug (e.g., "next-js-development"). |
| name | string | Human-readable name (e.g., "Next.js Development"). |
| source | string | Source repository or provider. GitHub: "owner/repo". Well-known: "domain.com". |
| installs | integer | Total deduplicated install count. |
| sourceType | string | "github" for GitHub repos, "well-known" for /.well-known/ discovery sources. |
| installUrl | string \| null | GitHub URL or well-known base URL for installing. Use with: npx skills add {installUrl}. |
| url | string | Direct link to the skill's page on skills.sh. |
| isDuplicate | boolean | Present and true if this skill is a detected fork/copy of another. Omitted when false. |

* * *

## Usage tips

Stable IDs

The `id` field is stable across requests and can be used to track skills, detect if a skill is already installed, and construct detail endpoint paths. The format is always`{source}/{slug}`.

Install detection

To check if a user has a specific skill installed, compare the`installUrl` or `id` against the skill folders on disk. For GitHub sources, the `installUrl`points to the repo URL. For well-known sources, it points to the base URL used with `npx skills add`.

Caching

Responses include `Cache-Control` headers. The leaderboard and search endpoints cache for 30-60 seconds, the detail endpoint for 5 minutes, and the curated endpoint for 5 minutes. Respect these when polling.

Filtering duplicates

Some skills are forks or copies of other skills. These are flagged with `isDuplicate: true`. You may want to filter these out in your UI to show only original skills.

### Browse

- [All skills](https://www.skills.sh/)
- [Trending](https://www.skills.sh/trending)
- [Hot](https://www.skills.sh/hot)
- [Official](https://www.skills.sh/official)
- [Security audits](https://www.skills.sh/audits)

### Topics

- [React](https://www.skills.sh/topic/react)
- [Next.js](https://www.skills.sh/topic/nextjs)
- [Design & UI](https://www.skills.sh/topic/design)
- [Mobile](https://www.skills.sh/topic/mobile)
- [Agent workflows](https://www.skills.sh/topic/agent-workflows)
- [Databases](https://www.skills.sh/topic/databases)
- [Testing](https://www.skills.sh/topic/testing)
- [Marketing](https://www.skills.sh/topic/marketing)
- [All topics →](https://www.skills.sh/topic)

### Agents

- [Claude Code](https://www.skills.sh/agent/claude-code)
- [Cursor](https://www.skills.sh/agent/cursor)
- [Codex](https://www.skills.sh/agent/codex)
- [GitHub Copilot](https://www.skills.sh/agent/github-copilot)
- [Windsurf](https://www.skills.sh/agent/windsurf)
- [Gemini](https://www.skills.sh/agent/gemini)
- [Cline](https://www.skills.sh/agent/cline)
- [AMP](https://www.skills.sh/agent/amp)
- [Antigravity](https://www.skills.sh/agent/antigravity)
- [ClawdBot](https://www.skills.sh/agent/clawdbot)
- [All agents →](https://www.skills.sh/agent)

### Docs

- [Overview](https://www.skills.sh/docs)
- [CLI](https://www.skills.sh/docs/cli)
- [Customize pages](https://www.skills.sh/docs/customize)
- [API](https://www.skills.sh/docs/api)
- [FAQ](https://www.skills.sh/docs/faq)

### Project

- [About](https://www.skills.sh/about)
- [Contact](https://www.skills.sh/contact)
- [Privacy](https://www.skills.sh/privacy)
- [Terms](https://www.skills.sh/terms)
- [GitHub](https://github.com/vercel-labs/skills)

Made with care by [Vercel](https://vercel.com/).Skills are open source on [GitHub](https://github.com/vercel-labs/skills).
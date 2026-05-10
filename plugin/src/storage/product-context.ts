import { basename, resolve } from "path";

import { getProjectId } from "../utils/project-id";
import type { ProductLink, ProjectConfig, RelatedRepo } from "../types";
import { loadProjectConfig } from "./json";

export type ProductMode = "single_repo" | "primary" | "secondary";
export type MissingPrimaryPolicy = "block" | "read_only" | "isolated";

export interface ProductRepoContext {
  id: string;
  root: string;
  role?: string;
  productRole?: "primary" | "secondary";
  repoProjectId?: string;
  ghRepo?: string;
}

export interface ProductContext {
  currentRoot: string;
  currentRepoId: string;
  repoProjectId: string;
  productId: string;
  productProjectId: string;
  primaryRoot: string;
  primaryRepoId: string;
  repos: Record<string, ProductRepoContext>;
  mode: ProductMode;
  missingPrimaryPolicy: MissingPrimaryPolicy;
  degraded?: boolean;
  warning?: string;
}

export class ProductContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductContextError";
  }
}

function inferSingleRepoId(config: ProjectConfig | null, root: string): string {
  return config?.name?.trim() || basename(root) || "project";
}

function toProductRepo(repo: RelatedRepo): ProductRepoContext {
  return {
    id: repo.id,
    root: resolve(repo.path),
    role: repo.role,
    productRole: repo.product_role,
    repoProjectId: repo.repo_project_id,
    ghRepo: repo.gh_repo,
  };
}

function addRepo(
  repos: Map<string, ProductRepoContext>,
  repo: ProductRepoContext,
): void {
  const existing = repos.get(repo.id);
  if (!existing) {
    repos.set(repo.id, repo);
    return;
  }

  if (existing.root === repo.root) {
    repos.set(repo.id, {
      ...existing,
      ...repo,
      repoProjectId: repo.repoProjectId ?? existing.repoProjectId,
      productRole: repo.productRole ?? existing.productRole,
    });
    return;
  }

  throw new ProductContextError(
    `Duplicate product repo id "${repo.id}" maps to both ${existing.root} and ${repo.root}`,
  );
}

function buildRepoMap(input: {
  config: ProjectConfig;
  product: ProductLink;
  currentRoot: string;
  repoProjectId: string;
}): Map<string, ProductRepoContext> {
  const repos = new Map<string, ProductRepoContext>();
  addRepo(repos, {
    id: input.product.repo_id,
    root: input.currentRoot,
    productRole: input.product.role,
    repoProjectId: input.repoProjectId,
  });

  for (const related of input.config.related_repos ?? []) {
    addRepo(repos, toProductRepo(related));
  }

  return repos;
}

function requirePrimaryRepo(
  repos: Map<string, ProductRepoContext>,
  primaryRepoId: string,
): ProductRepoContext {
  const primary = repos.get(primaryRepoId);
  if (!primary) {
    throw new ProductContextError(
      `product.primary_repo_id "${primaryRepoId}" does not match current repo_id or related_repos`,
    );
  }
  return primary;
}

async function resolvePrimaryProjectId(input: {
  product: ProductLink;
  repoProjectId: string;
  primary: ProductRepoContext;
}): Promise<{
  productProjectId: string;
  degraded?: boolean;
  warning?: string;
}> {
  const configured = input.primary.repoProjectId;
  const derived = await getProjectId(input.primary.root);
  const primaryProjectId = derived ?? configured;
  if (primaryProjectId) return { productProjectId: primaryProjectId };

  if (input.product.missing_primary_policy === "isolated") {
    return {
      productProjectId: input.repoProjectId,
      degraded: true,
      warning:
        "Product primary could not be resolved; isolated policy uses repo-local ADV state.",
    };
  }

  throw new ProductContextError(
    `Product primary repo "${input.product.primary_repo_id}" could not resolve a project id at ${input.primary.root}`,
  );
}

/** Resolve repo-local and product-level ADV identity for a checkout. */
export async function resolveProductContext(
  root: string,
): Promise<ProductContext> {
  const currentRoot = resolve(root);
  const config = await loadProjectConfig(currentRoot);
  const repoProjectId = await getProjectId(currentRoot);
  if (!repoProjectId) {
    throw new ProductContextError(
      `repo project id could not be resolved for ${currentRoot}`,
    );
  }

  const product = config?.product;
  if (!config || !product) {
    const currentRepoId = inferSingleRepoId(config, currentRoot);
    return {
      currentRoot,
      currentRepoId,
      repoProjectId,
      productId: currentRepoId,
      productProjectId: repoProjectId,
      primaryRoot: currentRoot,
      primaryRepoId: currentRepoId,
      repos: {
        [currentRepoId]: {
          id: currentRepoId,
          root: currentRoot,
          repoProjectId,
        },
      },
      mode: "single_repo",
      missingPrimaryPolicy: "block",
    };
  }

  const repos = buildRepoMap({ config, product, currentRoot, repoProjectId });
  const primary = requirePrimaryRepo(repos, product.primary_repo_id);

  if (
    product.role === "primary" &&
    product.primary_repo_id !== product.repo_id
  ) {
    throw new ProductContextError(
      "primary product config must use current repo_id as primary_repo_id",
    );
  }

  const primaryResolution = await resolvePrimaryProjectId({
    product,
    repoProjectId,
    primary,
  });

  return {
    currentRoot,
    currentRepoId: product.repo_id,
    repoProjectId,
    productId: product.id,
    productProjectId: primaryResolution.productProjectId,
    primaryRoot: primary.root,
    primaryRepoId: primary.id,
    repos: Object.fromEntries(repos.entries()),
    mode: product.role,
    missingPrimaryPolicy: product.missing_primary_policy,
    degraded: primaryResolution.degraded,
    warning: primaryResolution.warning,
  };
}

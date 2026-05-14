export type PaginationParams = {
  page: number;
  limit: number;
  skip: number;
  take: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}

export function getPaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = parsePositiveInt(searchParams.get("page"), DEFAULT_PAGE);
  const requestedLimit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.min(requestedLimit, MAX_LIMIT);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function getPaginationMeta(
  params: Pick<PaginationParams, "page" | "limit">,
  total: number
): PaginationMeta {
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / params.limit),
  };
}

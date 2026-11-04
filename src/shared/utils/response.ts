import { FastifyReply } from "fastify";

/**
 * Standardized API response helpers.
 * All route handlers should use these for consistent response shape.
 *
 * Success: { success: true, data: T, meta?: M }
 * Error:   handled by the error handler plugin
 */

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): FastifyReply {
  return reply.status(statusCode).send({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function sendCreated<T>(
  reply: FastifyReply,
  data: T,
  meta?: Record<string, unknown>,
): FastifyReply {
  return sendSuccess(reply, data, 201, meta);
}

export function sendNoContent(reply: FastifyReply): FastifyReply {
  return reply.status(204).send();
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function sendPaginated<T>(
  reply: FastifyReply,
  data: T[],
  meta: PaginatedMeta,
): FastifyReply {
  return reply.status(200).send({
    success: true,
    data,
    meta,
  });
}

/** Parse pagination params from query string with safe defaults */
export function parsePagination(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(query.pageSize ?? "20"), 10) || 20));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

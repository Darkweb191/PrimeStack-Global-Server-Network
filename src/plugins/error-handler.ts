import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../core/errors.js";
import { logger } from "../core/logger.js";

/**
 * Global error handler plugin.
 * Serializes all errors into a consistent JSON structure with i18n messages.
 *
 * Response shape:
 *   {
 *     success: false,
 *     error: {
 *       code: "NOT_FOUND",
 *       message: "Terminal not found"  // localized
 *     },
 *     details?: { ... }
 *   }
 */
export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler(async (error, request: FastifyRequest, reply: FastifyReply) => {
    // Zod validation errors
    if (error instanceof ZodError) {
      const message = request.t
        ? request.t("errors:VALIDATION_ERROR", { message: error.errors.map((e) => e.message).join(", ") })
        : `Validation failed: ${error.errors.map((e) => e.message).join(", ")}`;

      return reply.status(422).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message,
        },
        details: error.errors,
      });
    }

    // Our domain errors
    if (error instanceof AppError) {
      // Attempt i18n translation of the error code
      const message = request.t
        ? request.t(`errors:${error.code}`, error.details as Record<string, unknown>) ||
          error.message
        : error.message;

      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message,
        },
        ...(error.details ? { details: error.details } : {}),
      });
    }

    // Unknown errors — log and return generic 500
    logger.error({ err: error, path: request.url, method: request.method }, "Unhandled error");

    const message = request.t ? request.t("errors:INTERNAL_ERROR") : "An internal error occurred";

    return reply.status(500).send({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message,
      },
    });
  });

  // Handle 404 for unmatched routes
  app.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const message = request.t
      ? request.t("errors:NOT_FOUND", { resource: "Route" })
      : "Route not found";

    return reply.status(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `${message}: ${request.method} ${request.url}`,
      },
    });
  });
}

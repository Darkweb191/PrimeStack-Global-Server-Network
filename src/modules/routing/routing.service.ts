import { Prisma, type PrismaClient } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type { CreateRouteInput, UpdateRouteInput } from "./routing.types.js";

/**
 * Routing Engine Service
 *
 * Determines which host connection a transaction should be routed to.
 * Matching criteria (in priority order):
 *   1. Merchant-specific routes (if merchantId is provided)
 *   2. BIN pattern match (first 6-8 digits of PAN)
 *   3. Card type match (VISA, MASTERCARD, etc.)
 *   4. Country routing
 *   5. Currency routing
 *   6. Default route (no specific criteria)
 *
 * Failover: if a primary route fails, the engine falls back to
 * the configured failover route.
 */
export class RoutingService {
  constructor(private prisma: PrismaClient) {}

  async createRoute(input: CreateRouteInput) {
    return this.prisma.route.create({
      data: {
        name: input.name,
        type: input.type as never,
        status: input.status as never,
        priority: input.priority,
        protocol: input.protocol,
        endpoint: input.endpoint,
        hostConnectionId: input.hostConnectionId,
        merchantId: input.merchantId,
        binPattern: input.binPattern,
        countryCode: input.countryCode,
        currency: input.currency,
        cardType: input.cardType,
        config: input.config as Prisma.InputJsonValue | undefined,
        failoverOf: input.failoverOf,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      include: { hostConnection: true },
    });
  }

  async getRoute(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: { hostConnection: true },
    });
    if (!route) {
      throw new NotFoundError("Route", id);
    }
    return route;
  }

  async listRoutes(filters: {
    status?: string;
    merchantId?: string;
    type?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.RouteWhereInput = {};
    if (filters.status) where.status = filters.status as never;
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.type) where.type = filters.type as never;

    const [routes, total] = await Promise.all([
      this.prisma.route.findMany({
        where,
        include: { hostConnection: true },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.route.count({ where }),
    ]);

    return {
      data: routes,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  async updateRoute(id: string, input: UpdateRouteInput) {
    const route = await this.prisma.route.findUnique({ where: { id } });
    if (!route) {
      throw new NotFoundError("Route", id);
    }

    return this.prisma.route.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type as never | undefined,
        status: input.status as never | undefined,
        priority: input.priority,
        endpoint: input.endpoint,
        hostConnectionId: input.hostConnectionId,
        binPattern: input.binPattern,
        countryCode: input.countryCode,
        currency: input.currency,
        cardType: input.cardType,
        config: input.config as Prisma.InputJsonValue | undefined,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      include: { hostConnection: true },
    });
  }

  async deleteRoute(id: string) {
    await this.prisma.route.findUnique({ where: { id } }).then((r) => {
      if (!r) throw new NotFoundError("Route", id);
    });

    return this.prisma.route.delete({ where: { id } });
  }

  /**
   * Find the best matching route for a transaction request.
   *
   * @param criteria Match criteria
   * @returns The best matching route, or null if no route found
   */
  async findRoute(criteria: {
    merchantId?: string;
    bin?: string;
    countryCode?: string;
    currency?: string;
    cardType?: string;
  }): Promise<Prisma.RouteGetPayload<{ include: { hostConnection: true } }> | null> {
    // Build the where clause with increasingly specific criteria
    const where: Prisma.RouteWhereInput = {
      status: "ACTIVE",
    };

    // Prefer merchant-specific routes
    if (criteria.merchantId) {
      where.merchantId = criteria.merchantId;
    }

    // Try exact matches first, then fall back to general routes
    const candidates = await this.prisma.route.findMany({
      where,
      include: { hostConnection: true },
      orderBy: [{ priority: "asc" }],
    });

    // Score each route based on how many criteria match
    const scored = candidates
      .map((route) => ({
        route,
        score: this.scoreRoute(route, criteria),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.route.priority - b.route.priority);

    if (scored.length === 0) {
      logger.warn({ criteria }, "No matching route found");
      return null;
    }

    const best = scored[0];
    logger.info(
      { routeId: best.route.id, routeName: best.route.name, score: best.score, criteria },
      "Route matched",
    );

    return best.route;
  }

  /**
   * Get the failover route for a given primary route.
   */
  async getFailoverRoute(routeId: string) {
    const failover = await this.prisma.route.findFirst({
      where: {
        failoverOf: routeId,
        status: "ACTIVE",
      },
      include: { hostConnection: true },
      orderBy: { priority: "asc" },
    });

    return failover;
  }

  // ── BIN Management ──────────────────────────────

  async createBin(input: {
    bin: string;
    cardType: string;
    cardBrand?: string;
    bankName?: string;
    countryCode?: string;
    currency?: string;
    isDebit?: boolean;
    isCredit?: boolean;
    isPrepaid?: boolean;
  }) {
    return this.prisma.bin.create({
      data: {
        bin: input.bin,
        cardType: input.cardType,
        cardBrand: input.cardBrand,
        bankName: input.bankName,
        countryCode: input.countryCode,
        currency: input.currency,
        isDebit: input.isDebit ?? false,
        isCredit: input.isCredit ?? false,
        isPrepaid: input.isPrepaid ?? false,
      },
    });
  }

  async lookupBin(bin: string) {
    // Match the longest BIN prefix
    const bins = await this.prisma.bin.findMany({
      where: {
        bin: { startsWith: bin.substring(0, Math.min(bin.length, 8)) },
      },
    });

    // Return the longest matching BIN
    const sorted = bins.sort((a, b) => b.bin.length - a.bin.length);
    return sorted[0] ?? null;
  }

  async listBins(filters: { cardType?: string; countryCode?: string; page: number; pageSize: number }) {
    const where: Prisma.BinWhereInput = {};
    if (filters.cardType) where.cardType = filters.cardType;
    if (filters.countryCode) where.countryCode = filters.countryCode;

    const [bins, total] = await Promise.all([
      this.prisma.bin.findMany({
        where,
        orderBy: { bin: "asc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.bin.count({ where }),
    ]);

    return {
      data: bins,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── Private Helpers ─────────────────────────────

  private scoreRoute(
    route: Prisma.RouteGetPayload<{ include: { hostConnection: true } }>,
    criteria: {
      bin?: string;
      countryCode?: string;
      currency?: string;
      cardType?: string;
    },
  ): number {
    let score = 0;

    // General routes get a base score
    if (!route.binPattern && !route.countryCode && !route.currency && !route.cardType) {
      score = 1;
      return score;
    }

    // BIN pattern match
    if (route.binPattern && criteria.bin) {
      if (criteria.bin.startsWith(route.binPattern)) {
        score += 100;
      } else {
        return 0; // exact BIN match required if pattern is specified
      }
    }

    // Country match
    if (route.countryCode && criteria.countryCode) {
      if (route.countryCode === criteria.countryCode) {
        score += 50;
      } else {
        return 0;
      }
    }

    // Currency match
    if (route.currency && criteria.currency) {
      if (route.currency === criteria.currency) {
        score += 30;
      } else {
        return 0;
      }
    }

    // Card type match
    if (route.cardType && criteria.cardType) {
      if (route.cardType === criteria.cardType) {
        score += 20;
      } else {
        return 0;
      }
    }

    return score;
  }
}

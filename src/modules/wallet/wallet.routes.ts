import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { WalletService } from "./wallet.service.js";
import { createWalletSchema, updateWalletSchema } from "./types.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError, NotFoundError } from "../../core/errors.js";

/**
 * Wallet REST routes.
 *
 * Base paths: /wallets (merchant HMAC) and /admin/wallets (admin JWT).
 */
export function registerWalletRoutes(
  app: FastifyInstance,
  walletService: WalletService,
): void {
  app.post("/wallets", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createWalletSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid wallet data", { errors: parsed.error.errors });
    }

    const wallet = await walletService.createWallet(parsed.data);
    return sendCreated(reply, wallet);
  });

  app.get("/wallets", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;

    const result = await walletService.listWallets({
      type: query.type as string | undefined,
      status: query.status as string | undefined,
      merchantId: query.merchantId as string | undefined,
      currency: query.currency as string | undefined,
      page,
      pageSize,
    });

    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/wallets/:address", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const wallet = await walletService.getWallet(address);
    return sendSuccess(reply, wallet);
  });

  app.get("/wallets/:address/balance", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const balance = await walletService.getBalance(address);
    return sendSuccess(reply, balance);
  });

  app.patch("/wallets/:address", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const parsed = updateWalletSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid update data", { errors: parsed.error.errors });
    }

    const wallet = await walletService.updateWallet(address, parsed.data);
    return sendSuccess(reply, wallet);
  });

  app.post("/wallets/:address/fund", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const body = request.body as { amount: string; description?: string };

    if (!body?.amount) {
      throw new ValidationError("amount is required");
    }

    const entry = await walletService.fundWallet(
      address,
      body.amount,
      body.description ?? "Wallet funding",
    );
    return sendSuccess(reply, entry, 201);
  });

  app.post("/wallets/:address/transfer", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const body = request.body as { destinationAddress?: string; amount?: string | number; currency?: string; description?: string };
    if (!body?.destinationAddress || body.amount == null || !body.currency) {
      throw new ValidationError("destinationAddress, amount, and currency are required");
    }
    const transfer = await walletService.transfer({
      sourceAddress: address,
      destinationAddress: body.destinationAddress,
      amount: String(body.amount),
      currency: body.currency.toUpperCase(),
      description: body.description,
    });
    return sendCreated(reply, transfer);
  });

  for (const [path, status] of [["freeze", "FROZEN"], ["unfreeze", "ACTIVE"]] as const) {
    app.post(`/wallets/:address/${path}`, async (request: FastifyRequest, reply: FastifyReply) => {
      const { address } = request.params as { address: string };
      const wallet = await walletService.updateWallet(address, { status });
      return sendSuccess(reply, wallet);
    });
  }

  app.get("/wallets/:address/statement", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = parsePagination(query);
    const statement = await walletService.getStatement(address, page, pageSize);
    return sendPaginated(reply, statement.data, statement.meta);
  });

  app.post("/wallets/:address/beneficiaries", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const body = request.body as { beneficiaryName?: string; beneficiaryIdentifier?: string };
    if (!body?.beneficiaryName?.trim() || !body?.beneficiaryIdentifier?.trim()) {
      throw new ValidationError("beneficiaryName and beneficiaryIdentifier are required");
    }
    const beneficiary = await walletService.addBeneficiary(address, {
      beneficiaryName: body.beneficiaryName.trim(),
      beneficiaryIdentifier: body.beneficiaryIdentifier.trim(),
    });
    return sendCreated(reply, beneficiary);
  });

  app.get("/wallets/:address/beneficiaries", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    return sendSuccess(reply, await walletService.listBeneficiaries(address));
  });

  app.post("/wallets/:address/virtual-accounts", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const body = request.body as { currency?: string };
    if (!body?.currency || !/^[A-Za-z]{3}$/.test(body.currency)) {
      throw new ValidationError("currency must be a three-letter code");
    }
    const account = await walletService.createVirtualAccount(address, body.currency);
    return sendCreated(reply, account);
  });

  app.get("/wallets/:address/virtual-accounts", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    return sendSuccess(reply, await walletService.listVirtualAccounts(address));
  });

  app.put("/wallets/:address/limits", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const body = request.body as { dailyLimit?: string; monthlyLimit?: string; yearlyLimit?: string };
    return sendSuccess(reply, await walletService.setLimits(address, body));
  });

  app.get("/wallets/:address/limits", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const limits = await walletService.getLimits(address);
    if (!limits) throw new NotFoundError("Wallet limits", address);
    return sendSuccess(reply, limits);
  });

  app.post("/wallets/:address/holds", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const body = request.body as { amount?: string | number; reference?: string; reason?: string; releaseDate?: string };
    if (body?.amount == null || !body.reference?.trim() || !body.reason?.trim()) {
      throw new ValidationError("amount, reference, and reason are required");
    }
    const hold = await walletService.createHold(address, {
      amount: String(body.amount),
      reference: body.reference.trim(),
      reason: body.reason.trim(),
      releaseDate: body.releaseDate ? new Date(body.releaseDate) : undefined,
    });
    return sendCreated(reply, hold);
  });

  app.post("/wallet-holds/:reference/release", async (request: FastifyRequest, reply: FastifyReply) => {
    const { reference } = request.params as { reference: string };
    return sendSuccess(reply, await walletService.releaseHold(reference));
  });

  app.get("/wallet-holds", async (_request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, await walletService.listHolds());
  });

  app.post("/escrows", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      reference?: string;
      buyerAddress?: string;
      sellerAddress?: string;
      amount?: string | number;
      currency?: string;
    };
    if (!body?.reference?.trim() || !body.buyerAddress || !body.sellerAddress || body.amount == null || !body.currency) {
      throw new ValidationError("reference, buyerAddress, sellerAddress, amount, and currency are required");
    }
    const escrow = await walletService.createEscrow({
      reference: body.reference.trim(),
      buyerAddress: body.buyerAddress,
      sellerAddress: body.sellerAddress,
      amount: String(body.amount),
      currency: body.currency.toUpperCase(),
    });
    return sendCreated(reply, escrow);
  });

  app.get("/escrows", async (_request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, await walletService.listEscrows());
  });

  for (const [action, status] of [["release", "RELEASED"], ["refund", "REFUNDED"]] as const) {
    app.post(`/escrows/:reference/${action}`, async (request: FastifyRequest, reply: FastifyReply) => {
      const { reference } = request.params as { reference: string };
      return sendSuccess(reply, await walletService.closeEscrow(reference, status));
    });
  }

  app.post("/merchant-wallets", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { merchantId?: string; walletAddress?: string; settlementFrequency?: string };
    if (!body?.merchantId || !body.walletAddress || !body.settlementFrequency) {
      throw new ValidationError("merchantId, walletAddress, and settlementFrequency are required");
    }
    return sendCreated(reply, await walletService.assignMerchantWallet({
      merchantId: body.merchantId,
      walletAddress: body.walletAddress,
      settlementFrequency: body.settlementFrequency,
    }));
  });

  app.put("/treasury-wallets/:address", async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string };
    const body = request.body as { purpose?: string };
    if (!body?.purpose?.trim()) throw new ValidationError("purpose is required");
    return sendSuccess(reply, await walletService.assignTreasuryWallet(address, body.purpose.trim()));
  });

  app.get("/fee-rules", async (_request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, await walletService.listFeeRules());
  });

  app.post("/fee-rules", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { transactionType?: string; feeType?: string; value?: string | number; currency?: string };
    if (!body?.transactionType?.trim() || !body.feeType || body.value == null || !body.currency) {
      throw new ValidationError("transactionType, feeType, value, and currency are required");
    }
    return sendCreated(reply, await walletService.createFeeRule({
      transactionType: body.transactionType.trim(),
      feeType: body.feeType,
      value: String(body.value),
      currency: body.currency,
    }));
  });
}

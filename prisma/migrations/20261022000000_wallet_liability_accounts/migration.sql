BEGIN;

UPDATE "Account" AS a
SET
  "balance" = -a."balance",
  "type" = 'LIABILITY'
FROM "Wallet" AS w
WHERE w."accountId" = a."id"
  AND a."type" = 'ASSET';

COMMIT;

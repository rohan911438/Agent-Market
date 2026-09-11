-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerAccountId" TEXT NOT NULL,
    "amountUsd" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "settledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payout_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "ProviderAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "walletId" TEXT,
    "userId" TEXT,
    "paymentId" TEXT,
    "providerUsed" TEXT,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "statusCode" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "listingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiRequest_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApiRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApiRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApiRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ApiListing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ApiRequest" ("cacheHit", "createdAt", "errorCode", "id", "ipAddress", "latencyMs", "method", "paymentId", "providerUsed", "requestId", "route", "statusCode", "userId", "walletId") SELECT "cacheHit", "createdAt", "errorCode", "id", "ipAddress", "latencyMs", "method", "paymentId", "providerUsed", "requestId", "route", "statusCode", "userId", "walletId" FROM "ApiRequest";
DROP TABLE "ApiRequest";
ALTER TABLE "new_ApiRequest" RENAME TO "ApiRequest";
CREATE UNIQUE INDEX "ApiRequest_requestId_key" ON "ApiRequest"("requestId");
CREATE INDEX "ApiRequest_route_idx" ON "ApiRequest"("route");
CREATE INDEX "ApiRequest_walletId_idx" ON "ApiRequest"("walletId");
CREATE INDEX "ApiRequest_createdAt_idx" ON "ApiRequest"("createdAt");
CREATE INDEX "ApiRequest_listingId_idx" ON "ApiRequest"("listingId");
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentRef" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "amountAtomic" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transactionId" TEXT,
    "walletId" TEXT,
    "userId" TEXT,
    "cachedResponseId" TEXT,
    "listingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    CONSTRAINT "Payment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_cachedResponseId_fkey" FOREIGN KEY ("cachedResponseId") REFERENCES "CachedResponse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ApiListing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amountAtomic", "asset", "cachedResponseId", "createdAt", "id", "network", "paymentRef", "resource", "scheme", "settledAt", "status", "transactionId", "userId", "walletId") SELECT "amountAtomic", "asset", "cachedResponseId", "createdAt", "id", "network", "paymentRef", "resource", "scheme", "settledAt", "status", "transactionId", "userId", "walletId" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_paymentRef_key" ON "Payment"("paymentRef");
CREATE INDEX "Payment_walletId_idx" ON "Payment"("walletId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_listingId_idx" ON "Payment"("listingId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Payout_providerAccountId_idx" ON "Payout"("providerAccountId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

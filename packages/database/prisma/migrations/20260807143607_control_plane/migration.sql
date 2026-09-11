-- CreateTable
CREATE TABLE "ProviderAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApiListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerAccountId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "upstreamUrl" TEXT NOT NULL,
    "openApiSpec" TEXT,
    "docsUrl" TEXT,
    "pricingModel" TEXT NOT NULL DEFAULT 'pay_per_call',
    "priceUsd" REAL,
    "payoutWalletAddress" TEXT,
    "payoutSplitBps" INTEGER NOT NULL DEFAULT 8000,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    CONSTRAINT "ApiListing_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "ProviderAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_email_key" ON "ProviderAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_apiKeyHash_key" ON "ProviderAccount"("apiKeyHash");

-- CreateIndex
CREATE INDEX "ProviderAccount_status_idx" ON "ProviderAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApiListing_slug_key" ON "ApiListing"("slug");

-- CreateIndex
CREATE INDEX "ApiListing_providerAccountId_idx" ON "ApiListing"("providerAccountId");

-- CreateIndex
CREATE INDEX "ApiListing_status_idx" ON "ApiListing"("status");

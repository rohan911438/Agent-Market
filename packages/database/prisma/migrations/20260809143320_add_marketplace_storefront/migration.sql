-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "listingIds" TEXT NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiListing" (
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
    "parsedOpenApiSpec" TEXT,
    "docsUrl" TEXT,
    "pricingModel" TEXT NOT NULL DEFAULT 'pay_per_call',
    "priceUsd" REAL,
    "payoutWalletAddress" TEXT,
    "payoutSplitBps" INTEGER NOT NULL DEFAULT 8000,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "avgRating" REAL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    CONSTRAINT "ApiListing_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "ProviderAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ApiListing" ("category", "createdAt", "description", "docsUrl", "id", "name", "openApiSpec", "parsedOpenApiSpec", "payoutSplitBps", "payoutWalletAddress", "priceUsd", "pricingModel", "providerAccountId", "publishedAt", "slug", "status", "tags", "updatedAt", "upstreamUrl", "version") SELECT "category", "createdAt", "description", "docsUrl", "id", "name", "openApiSpec", "parsedOpenApiSpec", "payoutSplitBps", "payoutWalletAddress", "priceUsd", "pricingModel", "providerAccountId", "publishedAt", "slug", "status", "tags", "updatedAt", "upstreamUrl", "version" FROM "ApiListing";
DROP TABLE "ApiListing";
ALTER TABLE "new_ApiListing" RENAME TO "ApiListing";
CREATE UNIQUE INDEX "ApiListing_slug_key" ON "ApiListing"("slug");
CREATE INDEX "ApiListing_providerAccountId_idx" ON "ApiListing"("providerAccountId");
CREATE INDEX "ApiListing_status_idx" ON "ApiListing"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

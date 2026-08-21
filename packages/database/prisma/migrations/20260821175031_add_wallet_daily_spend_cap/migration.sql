-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL,
    "dailySpendAtomic" BIGINT NOT NULL DEFAULT 0,
    "dailySpendDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Wallet" ("address", "firstSeenAt", "id", "isVerified", "lastSeenAt", "network", "userId") SELECT "address", "firstSeenAt", "id", "isVerified", "lastSeenAt", "network", "userId" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "ProviderConnection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'LIARA',
    "mode" "Mode" NOT NULL DEFAULT 'LIVE',
    "label" TEXT NOT NULL,
    "teamRef" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "validatedAt" TIMESTAMPTZ(3),
    "syncedAt" TIMESTAMPTZ(3),
    "disconnectedAt" TIMESTAMPTZ(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "connectionId" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("connectionId")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "mode" "Mode" NOT NULL DEFAULT 'LIVE',
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "status" TEXT,
    "scale" DOUBLE PRECISION,
    "isDeployed" BOOLEAN,
    "planId" TEXT,
    "providerMissing" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderConnection_userId_status_idx" ON "ProviderConnection"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConnection_userId_provider_teamRef_key" ON "ProviderConnection"("userId", "provider", "teamRef");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConnection_id_userId_mode_key" ON "ProviderConnection"("id", "userId", "mode");

-- CreateIndex
CREATE INDEX "Application_userId_connectionId_idx" ON "Application"("userId", "connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_connectionId_providerId_key" ON "Application"("connectionId", "providerId");

-- AddForeignKey
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "ProviderConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_connectionId_userId_mode_fkey" FOREIGN KEY ("connectionId", "userId", "mode") REFERENCES "ProviderConnection"("id", "userId", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;

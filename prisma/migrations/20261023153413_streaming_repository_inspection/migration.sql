-- CreateTable
CREATE TABLE "RepositoryInspection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "input" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "events" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "error" JSONB,
    "leaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RepositoryInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepositoryInspection_userId_state_idx" ON "RepositoryInspection"("userId", "state");

-- AddForeignKey
ALTER TABLE "RepositoryInspection" ADD CONSTRAINT "RepositoryInspection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Deployment"
ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'PLANNED',
ADD COLUMN "heartbeatAt" TIMESTAMPTZ(3),
ADD COLUMN "recheckLeaseUntil" TIMESTAMPTZ(3),
ADD COLUMN "recovery" JSONB,
ADD COLUMN "retryOf" UUID;
CREATE UNIQUE INDEX "Deployment_retryOf_key" ON "Deployment"("retryOf");

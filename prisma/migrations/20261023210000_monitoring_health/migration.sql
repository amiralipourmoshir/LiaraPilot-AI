-- CreateTable
CREATE TABLE "HealthMonitor" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "deploymentId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "failureThreshold" INTEGER NOT NULL DEFAULT 3,
    "path" TEXT NOT NULL,
    "expectedText" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "latencyMs" INTEGER,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "lastSuccessAt" TIMESTAMPTZ(3),
    "nextCheckAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSample" (
    "id" UUID NOT NULL,
    "monitorId" UUID NOT NULL,
    "healthy" BOOLEAN NOT NULL,
    "status" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthIncident" (
    "id" UUID NOT NULL,
    "monitorId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "diagnosis" JSONB,
    "diagnosisLeaseUntil" TIMESTAMPTZ(3),
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "HealthIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthIncidentEvent" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthIncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAction" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PLANNED',
    "hash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "result" JSONB,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthMonitor_enabled_nextCheckAt_idx" ON "HealthMonitor"("enabled", "nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "HealthMonitor_userId_applicationId_key" ON "HealthMonitor"("userId", "applicationId");

-- CreateIndex
CREATE INDEX "HealthSample_monitorId_createdAt_idx" ON "HealthSample"("monitorId", "createdAt");

-- CreateIndex
CREATE INDEX "HealthIncident_userId_state_openedAt_idx" ON "HealthIncident"("userId", "state", "openedAt");

-- CreateIndex
CREATE INDEX "HealthIncidentEvent_incidentId_createdAt_idx" ON "HealthIncidentEvent"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "HealthMonitor" ADD CONSTRAINT "HealthMonitor_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSample" ADD CONSTRAINT "HealthSample_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "HealthMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthIncident" ADD CONSTRAINT "HealthIncident_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "HealthMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthIncidentEvent" ADD CONSTRAINT "HealthIncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "HealthIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAction" ADD CONSTRAINT "HealthAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "HealthIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;


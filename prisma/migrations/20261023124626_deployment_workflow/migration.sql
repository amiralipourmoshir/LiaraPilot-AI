-- CreateTable
CREATE TABLE "Deployment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PLANNED',
    "snapshot" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "errorCode" TEXT,
    "sourceId" TEXT,
    "releaseId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentEvent" (
    "id" UUID NOT NULL,
    "deploymentId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentOutbox" (
    "deploymentId" UUID NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeploymentOutbox_pkey" PRIMARY KEY ("deploymentId")
);

-- CreateTable
CREATE TABLE "DeploymentLease" (
    "applicationId" UUID NOT NULL,
    "deploymentId" UUID NOT NULL,

    CONSTRAINT "DeploymentLease_pkey" PRIMARY KEY ("applicationId")
);

-- CreateIndex
CREATE INDEX "Deployment_userId_createdAt_idx" ON "Deployment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentEvent_deploymentId_sequence_key" ON "DeploymentEvent"("deploymentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentLease_deploymentId_key" ON "DeploymentLease"("deploymentId");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentEvent" ADD CONSTRAINT "DeploymentEvent_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentOutbox" ADD CONSTRAINT "DeploymentOutbox_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentLease" ADD CONSTRAINT "DeploymentLease_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

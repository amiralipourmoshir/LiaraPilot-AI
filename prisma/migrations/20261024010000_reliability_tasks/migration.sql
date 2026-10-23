CREATE TABLE "ReliabilityTask" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "applicationId" UUID NOT NULL,
 "kind" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'PLANNED', "hash" TEXT NOT NULL,
 "snapshot" JSONB NOT NULL, "result" JSONB, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "ReliabilityTask_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ReliabilityTask_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
 CONSTRAINT "ReliabilityTask_application_fk" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE
);
CREATE INDEX "ReliabilityTask_userId_applicationId_createdAt_idx" ON "ReliabilityTask"("userId","applicationId","createdAt");
CREATE INDEX "ReliabilityTask_kind_state_idx" ON "ReliabilityTask"("kind","state");

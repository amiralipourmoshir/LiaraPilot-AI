CREATE TABLE "ReliabilityRun" (
 "id" UUID NOT NULL,"userId" UUID NOT NULL,"applicationId" UUID NOT NULL,"kind" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'QUEUED',"input" JSONB NOT NULL,"events" JSONB NOT NULL DEFAULT '[]',"result" JSONB,"error" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "ReliabilityRun_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ReliabilityRun_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
 CONSTRAINT "ReliabilityRun_application_fk" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE
);
CREATE INDEX "ReliabilityRun_userId_applicationId_createdAt_idx" ON "ReliabilityRun"("userId","applicationId","createdAt");
CREATE INDEX "ReliabilityRun_state_createdAt_idx" ON "ReliabilityRun"("state","createdAt");

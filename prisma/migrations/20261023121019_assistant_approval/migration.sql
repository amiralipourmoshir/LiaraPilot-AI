-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "Mode" NOT NULL DEFAULT 'LIVE',
    "busyUntil" TIMESTAMPTZ(3),
    "busyToken" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "diagnosis" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRun" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RUNNING',
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantPlan" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantEvidence" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "tool" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'LIARA',
    "data" JSONB NOT NULL,
    "collectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRun_conversationId_idempotencyKey_key" ON "ChatRun"("conversationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AssistantPlan_conversationId_createdAt_idx" ON "AssistantPlan"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantEvidence_planId_idx" ON "AssistantEvidence"("planId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRun" ADD CONSTRAINT "ChatRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantPlan" ADD CONSTRAINT "AssistantPlan_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantEvidence" ADD CONSTRAINT "AssistantEvidence_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AssistantPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

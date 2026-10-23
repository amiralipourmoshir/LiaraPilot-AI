-- CreateTable
CREATE TABLE "DeploymentSecret" (
    "deploymentId" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,

    CONSTRAINT "DeploymentSecret_pkey" PRIMARY KEY ("deploymentId")
);

-- AddForeignKey
ALTER TABLE "DeploymentSecret" ADD CONSTRAINT "DeploymentSecret_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

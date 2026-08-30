CREATE UNIQUE INDEX "Document_tenantId_shipmentId_documentType_version_key"
ON "Document"("tenantId", "shipmentId", "documentType", "version");

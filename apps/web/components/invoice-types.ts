export interface InvoiceLine {
  id: string;
  chargeCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  currency: string;
  sortOrder: number;
}
export interface InvoiceDocument {
  id: string;
  invoiceId: string;
  documentType: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  createdAt: string;
}
export interface Invoice {
  id: string;
  invoiceNo: string;
  shipmentId: string;
  customerCompanyId: string;
  currency: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  dueDate: string;
  status: string;
  issuedAt: string | null;
  confirmedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  shipment: { shipmentNo: string; polCode: string; podCode: string };
  customer: { id: string; name: string };
  lines: InvoiceLine[];
}
export interface InvoiceShipment {
  id: string;
  shipmentNo: string;
  customer: { name: string };
  polCode: string;
  podCode: string;
}

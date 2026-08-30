export interface ShipmentContainer {
  id: string;
  containerNo: string;
  containerType: string;
  sealNo: string | null;
  vgmWeight: string | null;
  pickupAt: string | null;
  gateInAt: string | null;
  loadedAt: string | null;
  dischargedAt: string | null;
}

export interface ShipmentEvent {
  id: string;
  eventType: string;
  eventTime: string;
  locationCode: string | null;
  locationName: string | null;
  remark: string | null;
  sourceType: string;
  customerVisible: boolean;
}

export interface ShipmentDocument {
  id: string;
  documentType: string;
  originalFilename: string;
  version: number;
  customerVisible: boolean;
  createdAt: string;
}

export interface Shipment {
  id: string;
  shipmentNo: string;
  bookingId: string;
  status: string;
  carrierCode: string | null;
  vessel: string | null;
  voyage: string | null;
  polCode: string;
  podCode: string;
  etd: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  mblNo: string | null;
  hblNo: string | null;
  completedAt: string | null;
  createdAt: string;
  booking: { bookingNo: string };
  customer: { id: string; name: string };
  containers: ShipmentContainer[];
  trackingEvents: ShipmentEvent[];
  documents: ShipmentDocument[];
}

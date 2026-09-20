export interface CustomerRate {
  id: string;
  polCode: string;
  polName: string;
  polDisplayName?: string;
  podCode: string;
  podName: string;
  podDisplayName?: string;
  carrierCode: string;
  serviceName: string | null;
  effectiveDate: string;
  expiryDate: string;
  etd: string | null;
  sailingPattern?: string | null;
  transitDays: number | null;
  containerType: string;
  oceanSellAmount: string;
  sellAmount: string;
  charges: Array<{
    id: string;
    chargeName: string;
    chargeBasis: 'PER_CONTAINER' | 'PER_BL' | 'PER_SHIPMENT';
    containerType: string | null;
    amount: string;
    currency: string;
  }>;
  currency: string;
}

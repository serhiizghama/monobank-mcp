export interface ClientInfo {
  clientId: string;
  name: string;
  webHookUrl: string;
  permissions: string;
  accounts: Account[];
  jars?: Jar[];
}

export interface Account {
  id: string;
  sendId: string;
  balance: number;
  creditLimit: number;
  type: 'black' | 'white' | 'platinum' | 'iron' | 'fop' | 'yellow' | 'eAid' | string;
  currencyCode: number;
  cashbackType: 'None' | 'UAH' | 'Miles';
  maskedPan: string[];
  iban: string;
}

export interface Jar {
  id: string;
  sendId: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal: number;
}

export interface StatementItem {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  hold: boolean;
  invoiceId?: string;
  receiptId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
  comment?: string;
}

export interface ExchangeRate {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateSell?: number;
  rateBuy?: number;
  rateCross?: number;
}

export function formatAmount(kopiykas: number): string {
  return (kopiykas / 100).toFixed(2);
}

export const CURRENCY_SYMBOLS: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
  756: 'CHF',
  985: 'PLN',
  203: 'CZK',
};

export type InvoicePrintItem = {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  unit: string | null;
  taxable: boolean;
};

export type InvoicePrintData = {
  business: {
    name: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    zipCode: string | null;
    taxNumber: string | null;
    logo: string | null;
    primaryColor: string | null;
  };
  client: {
    name: string;
    email: string;
    company: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    zipCode: string | null;
  };
  invoice: {
    number: string;
    status: string;
    issueDate: Date;
    dueDate: Date;
    currency: string;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    discount: number;
    discountType: string;
    total: number;
    paidAmount: number;
    balanceDue: number;
    notes: string | null;
    terms: string | null;
    footer: string | null;
    items: InvoicePrintItem[];
  };
};

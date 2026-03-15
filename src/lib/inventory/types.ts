export type InventoryTransactionType =
  | "receipt"
  | "usage"
  | "adjustment"
  | "transfer_in"
  | "transfer_out"
  | "count";

export type InventorySummaryRow = {
  material_id: string;
  material_name: string;
  location_id: string;
  location_name: string;
  qty_on_hand: number;
  avg_unit_cost: number;
  inventory_value: number;
  negative_flag: boolean;
  inventory_unit: string | null;
  inventory_enabled: boolean;
};

export type CreateReceiptInput = {
  material_name: string;
  inventory_unit: string;
  quantity: number;
  total_cost: number | null;
  transaction_date: string;
  location_id?: string | null;
  vendor_id?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  invoiced_final?: boolean;
  company_id?: string | null;
  created_by_user_id?: string | null;
};

export type UpdateReceiptInput = {
  quantity?: number;
  total_cost?: number | null;
  transaction_date?: string;
  location_id?: string | null;
  vendor_id?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  invoiced_final?: boolean;
  edit_reason?: string | null;
};

export type CreateUsageInput = {
  material_id: string;
  quantity: number;
  transaction_date: string;
  location_id?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  company_id?: string | null;
};

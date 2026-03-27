-- ─── Uniform Inventory ────────────────────────────────────────────────────────
-- Tracks stock receipts (ordered/received), issuances (given to employees),
-- returns (employee returned item), and manual adjustments.

CREATE TABLE IF NOT EXISTS at_uniform_inventory (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_type   text        NOT NULL CHECK (transaction_type IN ('receipt','issuance','return','adjustment')),
  item_option_id     uuid        NOT NULL REFERENCES at_field_options(id),
  size_variant_id    uuid        REFERENCES at_uniform_variants(id),
  color_variant_id   uuid        REFERENCES at_uniform_variants(id),
  -- positive = stock added (receipt, return); negative = stock removed (issuance)
  quantity           integer     NOT NULL,
  unit_cost          numeric(10,2),
  total_cost         numeric(10,2),
  transaction_date   date        NOT NULL DEFAULT CURRENT_DATE,
  vendor_name        text,
  reference_number   text,
  notes              text,
  -- null for receipts/adjustments; populated for issuances and returns
  employee_id        uuid        REFERENCES at_employees(id) ON DELETE SET NULL,
  is_void            boolean     NOT NULL DEFAULT false,
  created_by_user_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_at_uniform_inv_company     ON at_uniform_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_at_uniform_inv_item        ON at_uniform_inventory(item_option_id);
CREATE INDEX IF NOT EXISTS idx_at_uniform_inv_employee    ON at_uniform_inventory(employee_id);
CREATE INDEX IF NOT EXISTS idx_at_uniform_inv_date        ON at_uniform_inventory(transaction_date);

-- ─── Pay Adjustments ──────────────────────────────────────────────────────────
-- Deductions and reimbursements per paycheck date.
-- Auto-generated from uniform issuances/returns; also supports manual entries.

CREATE TABLE IF NOT EXISTS at_pay_adjustments (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id              uuid        NOT NULL REFERENCES at_employees(id) ON DELETE CASCADE,
  type                     text        NOT NULL CHECK (type IN ('deduction','reimbursement')),
  category                 text        NOT NULL DEFAULT 'manual' CHECK (category IN ('uniform','manual')),
  description              text        NOT NULL,
  amount                   numeric(10,2) NOT NULL CHECK (amount >= 0),
  paycheck_date            date        NOT NULL,
  status                   text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','cancelled')),
  -- Links back to the inventory issuance/return that generated this record (null if manual)
  source_inventory_id      uuid        REFERENCES at_uniform_inventory(id) ON DELETE SET NULL,
  -- For reimbursements: links to the original deduction being reversed
  reimburses_adjustment_id uuid        REFERENCES at_pay_adjustments(id) ON DELETE SET NULL,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_at_pay_adj_company        ON at_pay_adjustments(company_id);
CREATE INDEX IF NOT EXISTS idx_at_pay_adj_employee       ON at_pay_adjustments(employee_id);
CREATE INDEX IF NOT EXISTS idx_at_pay_adj_paycheck_date  ON at_pay_adjustments(paycheck_date);
CREATE INDEX IF NOT EXISTS idx_at_pay_adj_status         ON at_pay_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_at_pay_adj_source_inv     ON at_pay_adjustments(source_inventory_id);

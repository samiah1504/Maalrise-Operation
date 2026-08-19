-- =============================================================================
-- Migration 0010 — Reference data
--
-- Settings and expense categories are configuration the application needs in
-- order to run at all, not sample data: without them investor validation has no
-- unit price, reports have no branding, and no expense can be classified.
--
-- They live in a migration rather than in seed.sql so that `supabase db push`
-- against production yields a working system. seed.sql is demo data only, and
-- must never be run against production — it creates staff accounts with a
-- password published in this repository.
--
-- Every statement is idempotent, so re-running a push is safe.
-- =============================================================================

-- System settings (brief §28) — nothing configurable is hardcoded in the app.
-- ---------------------------------------------------------------------------
insert into system_settings (key, value, value_type, label, category, description) values
  ('company.name',              '"MaalRise"',                            'string',  'Company name',              'branding',    'Displayed across the app and on reports'),
  ('company.platform',          '"Maalvest Investment Limited"',         'string',  'Platform',                  'branding',    'Legal entity operating MaalRise'),
  ('company.address',           '"Abuja, Nigeria"',                      'string',  'Registered address',        'branding',    null),
  ('company.email',             '"info@maalrise.com"',                   'string',  'Contact email',             'branding',    null),
  ('company.phone',             '"+234 800 000 0000"',                   'string',  'Contact phone',             'branding',    null),
  ('company.logo_url',          '""',                                    'string',  'Logo URL',                  'branding',    'Shown on reports and in the app header'),
  ('company.currency',          '"NGN"',                                 'string',  'Reporting currency',        'finance',     'All reporting is in Naira'),
  ('investor.unit_price',       '100000',                                'number',  'Price per unit (₦)',        'investors',   'One investment unit'),
  ('investor.min_units_new',    '5',                                     'number',  'Minimum units — new investor',     'investors', null),
  ('investor.min_units_current','1',                                     'number',  'Minimum units — current investor', 'investors', null),
  ('profit.investor_share',     '0.7',                                   'number',  'Investor profit share',     'finance',     'Share of net profit allocated to investors at cycle close'),
  ('expense.approval_limit',    '250000',                                'number',  'Expense approval limit (₦)','approvals',   'Expenses above this amount require approval'),
  ('procurement.approval_limit','0',                                     'number',  'Procurement approval limit (₦)', 'approvals', 'Zero means every procurement order requires approval'),
  ('murabaha.default_repayment_days', '45',                              'number',  'Default repayment period (days)', 'finance', 'Roughly one and a half months'),
  ('murabaha.default_markup',   '0.15',                                  'number',  'Default Murabaha markup',   'finance',     'Applied as cost × markup'),
  ('cycle.default_duration_months', '12',                                'number',  'Default cycle duration (months)', 'finance', null),
  ('numbering.procurement',     '"MR-PO"',                               'string',  'Procurement prefix',        'numbering',   null),
  ('numbering.murabaha',        '"MR-MUR"',                              'string',  'Murabaha prefix',           'numbering',   null),
  ('numbering.shipment',        '"MR-SHP"',                              'string',  'Shipment prefix',           'numbering',   null),
  ('numbering.goods_receipt',   '"MR-GRN"',                              'string',  'Goods receipt prefix',      'numbering',   null),
  ('numbering.repayment',       '"MR-RCP"',                              'string',  'Repayment prefix',          'numbering',   null),
  ('numbering.expense',         '"MR-EXP"',                              'string',  'Expense prefix',            'numbering',   null),
  ('notifications.due_soon_days', '7',                                   'number',  'Alert lead time (days)',    'notifications', null),
  ('report.disclaimer',
   '"Monthly profit figures are provisional and provided for performance reporting purposes only. Final distributable profit will be determined after the completion of the 12-month investment cycle and the closing of the accounts. Investment returns are based on actual business performance and are not guaranteed."',
   'string', 'Investor report disclaimer', 'reports', 'Printed on every monthly investor report')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Expense categories (brief §19). Direct costs are capitalised into landed
-- cost and are therefore excluded from operating expenses in the P&L.
-- ---------------------------------------------------------------------------
insert into expense_categories (name, code, is_direct_cost) values
  ('Procurement',           'procurement',        true),
  ('Shipping',              'shipping',           true),
  ('Clearing',              'clearing',           true),
  ('Customs',               'customs',            true),
  ('Insurance',             'insurance',          true),
  ('Port charges',          'port_charges',       true),
  ('Local logistics',       'local_logistics',    true),
  ('Storage',               'storage',            false),
  ('Staff salaries',        'staff_salaries',     false),
  ('Professional fees',     'professional_fees',  false),
  ('Software',              'software',           false),
  ('Bank charges',          'bank_charges',       false),
  ('Foreign exchange charges', 'fx_charges',      false),
  ('Marketing',             'marketing',          false),
  ('Office expenses',       'office_expenses',    false),
  ('Legal and compliance',  'legal_compliance',   false),
  ('Miscellaneous',         'miscellaneous',      false)
on conflict (code) do nothing;


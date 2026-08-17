-- =============================================================================
-- Seed data — enough to demonstrate the full capital cycle.
-- Demo passwords are for local development only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Staff accounts (one per role)
-- ---------------------------------------------------------------------------
do $$
declare
  v_users jsonb := '[
    {"id": "11111111-1111-4111-8111-111111111111", "email": "ceo@maalrise.test",        "name": "Aisha Bello",     "role": "ceo",        "title": "Chief Executive Officer"},
    {"id": "22222222-2222-4222-8222-222222222222", "email": "operations@maalrise.test", "name": "Yusuf Ibrahim",   "role": "operations", "title": "Operations Officer"},
    {"id": "33333333-3333-4333-8333-333333333333", "email": "accounts@maalrise.test",   "name": "Fatima Sanni",    "role": "accounts",   "title": "Accounts Officer"},
    {"id": "44444444-4444-4444-8444-444444444444", "email": "auditor@maalrise.test",    "name": "Ismail Adeyemi",  "role": "auditor",    "title": "Internal Auditor"}
  ]'::jsonb;
  v_user jsonb;
begin
  for v_user in select * from jsonb_array_elements(v_users)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      (v_user ->> 'id')::uuid, 'authenticated', 'authenticated',
      v_user ->> 'email', crypt('MaalRise2026!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_user ->> 'name')
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), (v_user ->> 'id')::uuid, v_user ->> 'id',
      jsonb_build_object('sub', v_user ->> 'id', 'email', v_user ->> 'email'),
      'email', now(), now(), now()
    )
    on conflict do nothing;

    insert into profiles (id, full_name, email, job_title)
    values ((v_user ->> 'id')::uuid, v_user ->> 'name', v_user ->> 'email', v_user ->> 'title')
    on conflict (id) do nothing;

    insert into user_roles (user_id, role)
    values ((v_user ->> 'id')::uuid, (v_user ->> 'role')::user_role)
    on conflict do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Investment cycle, warehouse, accounts, business, suppliers, products
-- ---------------------------------------------------------------------------
insert into investment_cycles (id, name, code, start_date, maturity_date, duration_months, target_capital, status, notes)
values (
  '55555555-5555-4555-8555-555555555555',
  'MaalRise Cycle 1 (2026)', 'MR-CYCLE-2026-01',
  date_trunc('month', current_date - interval '3 months')::date,
  (date_trunc('month', current_date - interval '3 months') + interval '12 months')::date,
  12, 50000000, 'active',
  'First 12-month Murabaha trading cycle.'
)
on conflict (code) do nothing;

insert into warehouses (id, name, location, address)
values ('66666666-6666-4666-8666-666666666666', 'Main Warehouse', 'Lagos', 'Amuwo Odofin, Lagos, Nigeria')
on conflict do nothing;

insert into bank_accounts (id, name, account_type, bank_name, account_number, currency, opening_balance) values
  ('77777777-7777-4777-8777-777777777777', 'MaalRise Operations Account', 'bank', 'Jaiz Bank', '0001234567', 'NGN', 0),
  ('77777777-7777-4777-8777-777777777778', 'MaalRise Cash Account',       'cash', null,        null,         'NGN', 0),
  ('77777777-7777-4777-8777-777777777779', 'MaalRise USD Account',        'foreign_currency', 'Jaiz Bank', '0007654321', 'USD', 0)
on conflict do nothing;

-- The operating business is a normal record, never hardcoded in application code.
insert into businesses (id, name, contact_person, phone, email, address, registration_details, credit_limit, standard_repayment_days, status)
values (
  '88888888-8888-4888-8888-888888888888',
  'MaalGrow', 'Khadijah Umar', '+234 801 234 5678', 'accounts@maalgrow.test',
  'Wuse II, Abuja, Nigeria', 'RC 1234567', 30000000, 45, 'active'
)
on conflict do nothing;

insert into suppliers (id, name, contact_person, country, address, phone, email, wechat, currency, products_supplied, rating, avg_production_days, avg_delivery_days, status) values
  ('99999999-9999-4999-8999-999999999991', 'Foshan Sunrise Furniture Co. Ltd', 'Li Wei', 'China',
   'Longjiang, Foshan, Guangdong', '+86 138 0000 0001', 'sales@foshansunrise.test', 'foshansunrise',
   'USD', 'Office and home furniture', 4.5, 25, 40, 'active'),
  ('99999999-9999-4999-8999-999999999992', 'Hebei Little Rider Toys Ltd', 'Zhang Min', 'China',
   'Pingxiang, Hebei', '+86 138 0000 0002', 'export@littlerider.test', 'littlerider',
   'USD', 'Children ride-on cars and kids furniture', 4.2, 20, 38, 'active')
on conflict do nothing;

insert into products (product_code, name, category, description, supplier_id, model, colour_options, dimensions, unit_of_measure, weight_kg, volume_cbm, purchase_currency, purchase_cost, est_shipping_cost, est_landed_cost, expected_selling_price, status) values
  ('MR-P-0001', 'Executive Office Desk 1.6m', 'office_furniture',
   'Melamine executive desk with side return and cabinet.',
   '99999999-9999-4999-8999-999999999991', 'ED-1600', 'Walnut, Oak, Black', '1600 x 800 x 750 mm',
   'unit', 68.000, 0.6500, 'USD', 210.00, 45000.00, 380000.00, 460000.00, 'active'),
  ('MR-P-0002', 'Ergonomic Mesh Office Chair', 'office_furniture',
   'High-back mesh chair with lumbar support and adjustable arms.',
   '99999999-9999-4999-8999-999999999991', 'MC-220', 'Black, Grey', '650 x 650 x 1200 mm',
   'unit', 16.500, 0.1800, 'USD', 62.00, 12000.00, 112000.00, 138000.00, 'active'),
  ('MR-P-0003', '3-Seater Fabric Sofa', 'home_furniture',
   'Three-seater fabric sofa with solid wood frame.',
   '99999999-9999-4999-8999-999999999991', 'SF-300', 'Grey, Beige', '2100 x 900 x 850 mm',
   'unit', 82.000, 1.4000, 'USD', 295.00, 78000.00, 560000.00, 680000.00, 'active'),
  ('MR-P-0004', 'Kids Electric Ride-On Car 12V', 'kids_ride_on_cars',
   'Licensed 12V ride-on car with remote control and leather seat.',
   '99999999-9999-4999-8999-999999999992', 'RC-12V-A', 'Red, White, Blue', '1200 x 700 x 550 mm',
   'unit', 22.000, 0.3200, 'USD', 96.00, 18000.00, 176000.00, 225000.00, 'active'),
  ('MR-P-0005', 'Children Study Table & Chair Set', 'children_furniture',
   'Height-adjustable study desk with matching chair.',
   '99999999-9999-4999-8999-999999999992', 'CS-100', 'Pink, Blue', '900 x 550 x 760 mm',
   'unit', 24.000, 0.3600, 'USD', 78.00, 15000.00, 142000.00, 178000.00, 'active')
on conflict (product_code) do nothing;

-- ---------------------------------------------------------------------------
-- A few investors so the cycle has capital to deploy.
-- ---------------------------------------------------------------------------
insert into investors (id, full_name, phone, email, address, category, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Abdulrahman Musa', '+234 803 111 1111', 'a.musa@example.test', 'Kano, Nigeria', 'new_investor', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Zainab Ogunleye',  '+234 803 222 2222', 'z.ogunleye@example.test', 'Ibadan, Nigeria', 'new_investor', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Hauwa Danladi',    '+234 803 333 3333', 'h.danladi@example.test', 'Abuja, Nigeria', 'current_investor', 'active')
on conflict do nothing;

insert into investor_subscriptions (investor_id, investment_cycle_id, units, unit_price, total_amount, payment_date, payment_reference, status)
select i.id, '55555555-5555-4555-8555-555555555555', v.units, 100000, v.units * 100000,
       date_trunc('month', current_date - interval '3 months')::date, v.ref, 'active'
from (values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 50, 'TRF/2026/0001'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid, 30, 'TRF/2026/0002'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid, 20, 'TRF/2026/0003')
) as v(investor_id, units, ref)
join investors i on i.id = v.investor_id
where not exists (
  select 1 from investor_subscriptions s where s.investor_id = v.investor_id
);

-- Record the capital as a cash inflow so Cash at Hand is funded on a fresh seed.
do $$
declare
  v_sub record;
  v_cash uuid;
begin
  for v_sub in
    select * from investor_subscriptions where not capital_recorded
  loop
    insert into cash_transactions (
      bank_account_id, investment_cycle_id, transaction_date, direction, amount,
      category, description, reference_table, reference_id, payment_reference,
      created_by
    ) values (
      '77777777-7777-4777-8777-777777777777', v_sub.investment_cycle_id,
      v_sub.payment_date, 'inflow', v_sub.total_amount, 'investor_capital',
      'Investor capital received', 'investor_subscriptions', v_sub.id,
      v_sub.payment_reference, '33333333-3333-4333-8333-333333333333'
    )
    returning id into v_cash;

    update investor_subscriptions set capital_recorded = true where id = v_sub.id;
  end loop;
end;
$$;

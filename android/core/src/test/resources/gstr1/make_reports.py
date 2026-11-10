# Random but realistic marketplace GST reports for comparing the app with the website.
import csv, random, sys, datetime, os
import openpyxl
random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 7)
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
G = '24ABCDE1234F1Z6'
STATES = ['GUJARAT', 'Maharashtra', 'Delhi', 'Karnataka', 'Orissa', 'New Delhi', 'Tamil Nadu', 'Uttar Pradesh', 'West Bengal', 'Rajasthan', 'Telengana', 'Kerala', 'Punjab', 'Assam', 'Bihar']
HSN = [('6204', 5, 'Kurti cotton'), ('6109', 12, 'T-shirt'), ('5007', 5, 'Saree silk'), ('6211', 18, 'Track pant'), ('6302', 12, 'Bedsheet')]
def day(m, d): return datetime.date(2025, m, d)
sales, rets, inv = [], [], []
n = 0
for i in range(260):
    h, rt, desc = random.choice(HSN)
    st = random.choice(STATES)
    q = random.randint(1, 3)
    tx = round(random.uniform(150, 1800) * q, 2)
    tax = round(tx * rt / 100, 2)
    m = 3 if i % 23 else 2
    d = day(m, random.randint(1, 28))
    so = 'S%05d' % i
    sales.append(['x', 'Shop', G, so, d, h, q, rt, tx, tax, round(tx + tax, 2), 0, st, '', 2025, m, 1])
    if m == 3 and i % 9:
        n += 1
        inv.append(['INVOICE', d, so, desc, h, 'MSH25-%04d' % (n + (3 if n > 40 else 0)), d])
for i in range(70):
    s = random.choice(sales)
    st = s[12] if i % 5 else 'Bihar'
    tx = round(s[8] * (1 if i % 3 else 1.6), 2)
    rets.append(['x', 'Shop', G, s[3], s[4], day(3, random.randint(1, 28)), s[5], s[6], s[7], tx, round(tx * s[7] / 100, 2), round(tx * (1 + s[7] / 100), 2), 0, st, '', 2025, 3, 1])
    inv.append(['CREDIT NOTE', s[4], s[3], 'return', s[5], 'MSHCN25-%04d' % i, day(3, 28)])
SH = ['identifier', 'sup_name', 'gstin', 'sub_order_num', 'order_date', 'hsn_code', 'quantity', 'gst_rate', 'total_taxable_sale_value', 'tax_amount', 'total_invoice_value', 'taxable_shipping', 'end_customer_state_new', 'enrollment_no', 'financial_year', 'month_number', 'supplier_id']
RH = SH[:5] + ['cancel_return_date'] + SH[5:]
IH = ['Type', 'Order Date', 'Sub Order No.', 'Product Description', 'HSN', 'Invoice No.', 'Invoice Date']
# Amazon B2C MTR (+ a cancel) and B2B
AH = ['Seller Gstin', 'Invoice Number', 'Invoice Date', 'Transaction Type', 'Order Id', 'Shipment Id', 'Shipment Date', 'Order Date', 'Quantity', 'Item Description', 'Hsn/sac', 'Product Tax Code', 'Ship To State', 'Invoice Amount', 'Tax Exclusive Gross', 'Total Tax Amount', 'Cgst Rate', 'Sgst Rate', 'Utgst Rate', 'Igst Rate', 'Cgst Tax', 'Sgst Tax', 'Utgst Tax', 'Igst Tax', 'Customer Bill To Gstid', 'Buyer Name', 'Credit Note No', 'Credit Note Date']
amz, amzb = [], []
for i in range(90):
    h, rt, desc = random.choice(HSN)
    st = random.choice(STATES); home = st.upper() == 'GUJARAT'
    q = random.randint(1, 2); tx = round(random.uniform(300, 2500) * q, 2); tax = round(tx * rt / 100, 2)
    d = day(3, random.randint(1, 28)); inum = 'AMZ-%04d' % i
    typ = 'Shipment' if i % 11 else ('Refund' if i % 2 else 'Cancel')
    sign = -1 if typ == 'Refund' else 1
    row = [G, inum, d, typ, 'O%d' % i, 'SH%d' % i, d, d, q, desc, h, 'A_GEN_STANDARD', st.upper(), sign * round(tx + tax, 2), sign * tx, sign * tax,
           rt / 200 if home else 0, rt / 200 if home else 0, 0, 0 if home else rt / 100, sign * tax / 2 if home else 0, sign * tax / 2 if home else 0, 0, 0 if home else sign * tax, '', '', 'CN-%d' % i if typ == 'Refund' else '', d if typ == 'Refund' else '']
    amz.append(row)
for i in range(12):
    h, rt, desc = random.choice(HSN)
    tx = round(random.uniform(5000, 60000), 2); tax = round(tx * rt / 100, 2); d = day(3, random.randint(1, 28))
    typ = 'Shipment' if i % 4 else 'Refund'; sign = -1 if typ == 'Refund' else 1
    amzb.append([G, 'AMZB-%03d' % i, d, typ, 'B%d' % i, 'BS%d' % i, d, d, 1, desc, h, 'A_GEN_STANDARD', 'MAHARASHTRA', sign * round(tx + tax, 2), sign * tx, sign * tax, 0, 0, 0, rt / 100, 0, 0, 0, sign * tax,
                 '27AAACB2222C1ZH', 'Buyer Co', 'CNB-%d' % i if typ == 'Refund' else '', d if typ == 'Refund' else ''])
def write(name, head, rows):
    with open(os.path.join(out, name + '.csv'), 'w', newline='') as f:
        w = csv.writer(f); w.writerow(head)
        for r in rows: w.writerow([x.isoformat() if isinstance(x, datetime.date) else x for x in r])
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Sheet1'; ws.append(head)
    for r in rows: ws.append(r)
    wb.save(os.path.join(out, name + '.xlsx'))
write('tcs_sales', SH, sales); write('tcs_sales_return', RH, rets); write('Tax_invoice_details', IH, inv)
write('MTR_B2C-MAR-2025', AH, amz); write('MTR_B2B-MAR-2025', AH, amzb)
print('made', len(sales), len(rets), len(inv), len(amz), len(amzb))

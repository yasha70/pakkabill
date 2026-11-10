"""A small Meesho-style category template for the app's tests (ListingTest): a "Fill this" sheet with
field names in row 3, data from row 5, dropdown lists (on a hidden sheet and inline), Meesho's returns
price formula, an Example Sheet and the Instructions sheet's category id. Run: python3 make_template.py"""
import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation

wb = openpyxl.Workbook()
ins = wb.active; ins.title = 'Instructions'
ins['A1'] = 'How to fill this template'
ins['A3'], ins['B3'], ins['C3'] = '10771', '3', 'BASE'
fill = wb.create_sheet('Blouses-Fill this')
hid = wb.create_sheet('Hidden'); hid.sheet_state = 'hidden'
ex = wb.create_sheet('Example Sheet')
cols = [
    ('Product Name', 'Name buyers see'), ('Variation', 'Size'), ('Meesho Price', 'Selling price'), ('Returns Price', 'Price for returns'),
    ('MRP', 'Maximum retail price'), ('Color', 'Colour'), ('Image 1 (Front)', 'Main photo link'), ('Image 2', ''), ('Image 3', ''),
    ('SKU ID', 'Your code'), ('Group ID', 'Same for one catalogue'), ('Fabric', ''), ('Bust Size', 'Inches'), ('Country of Origin', ''),
    ('Manufacturer Details', ''), ('Packer Details', ''),
]
fill['A1'] = 'Blouses - bulk upload'
fill['A2'] = 'Compulsory fields'; fill.merge_cells('A2:I2')
fill['J2'] = 'Optional fields'; fill.merge_cells('J2:P2')
for i, (n, d) in enumerate(cols, start=1):
    c = fill.cell(row=3, column=i, value=n + ('\n' + d if d else ''))
    fill.cell(row=4, column=i, value='Fill as shown')
sizes = ['32', '34', '36', '38', 'Free Size']
colours = ['Red', 'Blue', 'Green', 'Black', 'Multicolor', 'Pink']
busts = [str(x) for x in range(30, 45)]
for i, v in enumerate(sizes, 1): hid.cell(row=i, column=1, value=v)
for i, v in enumerate(colours, 1): hid.cell(row=i, column=2, value=v)
for i, v in enumerate(busts, 1): hid.cell(row=i, column=3, value=int(v))
def dv(formula, rng):
    v = DataValidation(type='list', formula1=formula, allow_blank=True); fill.add_data_validation(v); v.add(rng)
dv("Hidden!$A$1:$A$5", 'B5:B304')
dv("Hidden!$B$1:$B$6", 'F5:F304')
dv('"Cotton,Silk,Rayon"', 'L5:L304')
dv("Hidden!$C$1:$C$15", 'M5:M304')
dv('"India,China"', 'N5:N304')
whole = DataValidation(type='custom', formula1='MOD(C5,1)=0', allow_blank=True); fill.add_data_validation(whole); whole.add('C5:C304')
for r in range(5, 305):
    fill.cell(row=r, column=4, value='=IF(C%d>31,C%d-31,"")' % (r, r))
# Meesho's example: how each field is stored (numbers as numbers)
for i, (n, d) in enumerate(cols, start=1): ex.cell(row=3, column=i, value=n)
ex_row = ['Cotton Blouse', '34', 499, None, 999, 'Red', 'https://x/1.jpg', '', '', 'B-RED-34', 'Group 01', 'Cotton', 34, 'India', 'Kavya', 'Kavya']
for i, v in enumerate(ex_row, start=1): ex.cell(row=5, column=i, value=v)
wb.save('Blouses-template.xlsx')
print('made Blouses-template.xlsx')

import frappe

def execute(filters=None):
    if not filters:
        filters = {}

    columns = get_columns()
    data = get_data(filters)

    return columns, data


def get_columns():
    return [
        {"label": "Employee", "fieldname": "employee", "fieldtype": "Data", "width": 120},
        {"label": "Employee Name", "fieldname": "employee_name", "fieldtype": "Data", "width": 180},
        {"label": "Total Pieces", "fieldname": "total_pieces", "fieldtype": "Float", "width": 120},
        {"label": "Total Dozen", "fieldname": "total_dozen", "fieldtype": "Float", "width": 120},
        {"label": "Total Amount", "fieldname": "total_amount", "fieldtype": "Currency", "width": 150},
    ]


def get_data(filters):
    conditions = ""
    if filters.get("contract_worker_payroll_entry"):
        # conditions["contract_worker_payroll_entry"] = filters.get("contract_worker_payroll_entry")
        conditions += " contract_worker_payroll_entry= '%s'" % filters["contract_worker_payroll_entry"]


    slips = frappe.db.sql("""
    SELECT 
        employee, 
        employee_name, 
        total_pieces, 
        (total_pieces / 12) AS total_dozen, 
        total_amount
    FROM `tabContract Worker Salary Slip`
    WHERE %s
	"""%conditions, as_dict=True)


    return slips

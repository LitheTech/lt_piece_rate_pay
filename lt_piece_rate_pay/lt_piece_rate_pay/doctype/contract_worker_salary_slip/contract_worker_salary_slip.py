# Copyright (c) 2025, Lithe-Tech Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt,ceil
from frappe.model.document import Document
from frappe import _
from lt_piece_rate_pay.lt_piece_rate_pay.doctype.employee_advance_payment.employee_advance_payment import get_total_advance

class ContractWorkerSalarySlip(Document):
    def validate(self):
        self.get_production_data()
        self.calculate_total_amount()
        
    def get_production_data(self):
        if not self.employee or not self.from_date or not self.to_date:
            frappe.throw(_("Please set Employee, From Date and To Date before calculating."))

        # Clear existing rows
        self.set("activities", [])

        # Fetch and aggregate production data
        data = frappe.db.sql("""
            SELECT
                dpd.process_name,
                dpd.rate,
                SUM(dpd.quantity) AS quantity,
                SUM(dpd.amount) AS amount,
                dp.production_date,
                dp.buyer,
                dp.po,
                dp.process_type,
                dp.floor,
                dp.facility_or_line
            FROM
                `tabDaily Production Details` dpd
            JOIN
                `tabDaily Production` dp ON dp.name = dpd.parent
            WHERE
                dpd.employee = %s
                AND dp.workflow_state ='Approved'
                AND dp.production_date BETWEEN %s AND %s
            GROUP BY
                dpd.process_name, dp.po,dp.facility_or_line
        """, (self.employee, self.from_date, self.to_date), as_dict=True)

        for row in data:
            if row.quantity!=0:
                  self.append("activities", {
					"process_name": row.process_name,
					"rate": row.rate,
					"quantity": row.quantity,
                    "quantitydz": row.quantity/12,
                    "amount":row.amount,
					"buyer": row.buyer,
					"production_date": row.production_date,
                    "po":row.po,
                    "process_type": row.process_type,
                    "floor": row.floor,
                    "line": row.facility_or_line
				})
    def calculate_total_amount(self):
        total = 0
        all_pieces = 0
        
        group_totals = {}
        
        for row in self.activities:
            amount = row.amount or 0
            # row.amount = ceil(row.rate * row.quantitydz)
            total += row.amount or 0
            all_pieces += row.quantity
            
            key = (row.floor, row.line)
            group_totals[key] = group_totals.get(key, 0) + amount
        self.total_amount = total
        self.total_pieces= all_pieces
        
        self.tax = sum(10 for amt in group_totals.values() if amt > 1000)
        self.advance = get_total_advance(
            self.employee, self.contract_worker_payroll_entry
        )

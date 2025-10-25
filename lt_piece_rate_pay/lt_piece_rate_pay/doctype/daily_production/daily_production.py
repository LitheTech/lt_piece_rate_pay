# Copyright (c) 2025, Lithe-Tech LTD and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

class DailyProduction(Document):
    def validate(self):
        # ✅ Ensure fields are numbers (avoid NoneType issues)
        total_qty = self.total_quantity or 0
        completed_qty = self.completed_quantity or 0
        bill_qty = self.bill_quantity or 0

        # ✅ Check validation
        if (completed_qty + bill_qty) > total_qty and self.is_revised==0:
            frappe.throw(
                _("Total Quantity cannot be less than the sum of Completed and Bill Quantity. "
                  "Total: {0}, Completed + Bill: {1}").format(total_qty, completed_qty + bill_qty),
                title=_("Quantity Mismatch")
            )
        self.validate_process_quantities()

    def validate_process_quantities(self):
        # Parent Bill Quantity
        bill_qty = self.bill_quantity or 0

        # Dict to sum quantities per process_name
        process_qty_map = {}

        for d in self.daily_production_details:
            if d.process_name:
                process_qty_map[d.process_name] = process_qty_map.get(d.process_name, 0) + (d.quantity or 0)

        # Check if any process total exceeds bill_qty
        for process_name, total in process_qty_map.items():
            if total > bill_qty:
                frappe.throw(
                    f"Total quantity for Process <b>{process_name}</b> "
                    f"({total}) cannot exceed Bill Quantity ({bill_qty})."
                )
	

@frappe.whitelist()
def get_completed_quantity(po, style,process_type=None,color=None):
    """
    Fetch total done quantity for a given PO + Style
    from previously saved Daily Production records.
    """
    if not po or not style:
        return 0
        

    # Sum qty from Daily Production where po + style match
    done_qty = frappe.db.sql("""
        SELECT COALESCE(SUM(bill_quantity), 0) as total_done
        FROM `tabDaily Production`
        WHERE po = %s AND style_list = %s AND color=%s and process_type=%s and is_revised=0
    """,values=[po,style,color,process_type], as_dict=True)
    # frappe.publish_realtime('msgprint',done_qty)

    return done_qty[0].total_done if done_qty else 0

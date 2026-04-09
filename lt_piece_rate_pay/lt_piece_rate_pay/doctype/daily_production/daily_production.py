# Copyright (c) 2025, Lithe-Tech LTD and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DailyProduction(Document):

    def total_rows_amount(self):
        tamount=0
        for row in self.daily_production_details:
            row.amount = ((row.quantity or 0) * (row.rate or 0))/12.0
            tamount=tamount+row.amount
        self.total_amount=tamount

    def validate(self):

        # ✅ totals from child
        self.set_totals_from_colors()

        # ✅ NEW VALIDATION (added)
        self.validate_color_quantities()

        total_qty = self.total_quantity or 0
        completed_qty = self.completed_quantity or 0
        bill_qty = self.bill_quantity or 0

        if (completed_qty + bill_qty) > total_qty and self.is_revised==0:
            frappe.throw(
                _("Total Quantity cannot be less than the sum of Completed and Bill Quantity. "
                  "Total: {0}, Completed + Bill: {1}").format(total_qty, completed_qty + bill_qty),
                title=_("Quantity Mismatch")
            )

        self.validate_process_quantities()
        self.total_rows_amount()

    # 🔹 already added earlier
    def set_totals_from_colors(self):
        total_qty = 0
        completed_qty = 0
        bill_qty = 0

        for row in self.daily_production_colors:
            total_qty += (row.color_quantity or 0)
            completed_qty += (row.done_quantity or 0)
            bill_qty += (row.ongoing_quantity or 0)

        self.total_quantity = total_qty
        self.completed_quantity = completed_qty
        self.bill_quantity = bill_qty

    # 🔥 NEW VALIDATION FUNCTION
    def validate_color_quantities(self):
        for row in self.daily_production_colors:
            color_qty = row.color_quantity or 0
            done_qty = row.done_quantity or 0
            ongoing_qty = row.ongoing_quantity or 0

            if (done_qty + ongoing_qty) > color_qty:
                frappe.throw(
                    _(
                        "For Color <b>{0}</b>: Done + Ongoing ({1}) "
                        "cannot exceed Color Quantity ({2})"
                    ).format(row.color, done_qty + ongoing_qty, color_qty),
                    title=_("Color Quantity Exceeded")
                )

    def validate_process_quantities(self):
        bill_qty = self.bill_quantity or 0
        process_qty_map = {}

        for d in self.daily_production_details:
            if d.process_name:
                process_qty_map[d.process_name] = process_qty_map.get(d.process_name, 0) + (d.quantity or 0)

        for process_name, total in process_qty_map.items():
            if total > bill_qty:
                frappe.throw(
                    f"Total quantity for Process <b>{process_name}</b> "
                    f"({total}) cannot exceed Bill Quantity ({bill_qty})."
                )

# ================= DONE QUANTITY API =================
@frappe.whitelist()
def get_done_quantity(po, color, process_type):
    """
    Returns MAX of done_quantity + ongoing_quantity
    across all Daily Production entries for given PO + color + process_type.
    """

    if not (po and color and process_type):
        return 0

    # 🔹 Get all Daily Production docs for this PO + process_type
    production_names = frappe.get_all(
        "Daily Production",
        filters={
            "po": po,
            "process_type": process_type
        },
        pluck="name"
    )

    if not production_names:
        return 0

    # 🔹 Get all matching child rows
    rows = frappe.get_all(
        "Daily Production Colors",
        filters={
            "parent": ["in", production_names],
            "parenttype": "Daily Production",
            "color": color
        },
        fields=["done_quantity", "ongoing_quantity"]
    )

    # 🔹 Calculate max sum
    max_sum = 0
    for r in rows:
        total = (r.done_quantity or 0) + (r.ongoing_quantity or 0)
        if total > max_sum:
            max_sum = total

    return max_sum
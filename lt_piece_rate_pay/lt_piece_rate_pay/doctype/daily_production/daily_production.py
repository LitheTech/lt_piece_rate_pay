import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import ceil


class DailyProduction(Document):

    # =========================================================
    # MAIN VALIDATE
    # =========================================================
    def validate(self):

        self.sync_latest_done_quantity()

        self.set_totals_from_colors()
        if self.is_revised !=1:
            self.validate_color_quantities()
        self.validate_process_quantities()
        self.total_rows_amount()

    # =========================================================
    # TOTAL CALCULATION
    # =========================================================
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

    # =========================================================
    # COLOR VALIDATION (row-level only)
    # =========================================================
    def validate_color_quantities(self):

        for row in self.daily_production_colors:

            allowed_qty = row.color_quantity or 0
            done = row.done_quantity or 0
            ongoing = row.ongoing_quantity or 0
            current_entry = done + ongoing

            if current_entry > allowed_qty:

                remaining = allowed_qty - (done or 0)

                frappe.throw(
                    _(
                        "❌ Quantity Exceeded for Color <b>{0}</b><br><br>"
                        "Allowed Quantity: <b>{1}</b><br>"
                        "Already Used (Max DB): <b>{2}</b><br>"
                        "Your Entry (Done + Ongoing): <b>{3}</b><br>"
                        "Remaining Allowed: <b>{4}</b><br><br>"
                        "Please adjust your entry before saving."
                    ).format(
                        row.color,
                        allowed_qty,
                        done,
                        current_entry,
                        remaining
                    ),
                    title=_("Quantity Exceeded")
                )

    # =========================================================
    # PROCESS VALIDATION
    # =========================================================
    def validate_process_quantities(self):

        bill_qty = self.bill_quantity or 0
        process_map = {}

        for d in self.daily_production_details:
            if d.process_name:
                process_map[d.process_name] = process_map.get(d.process_name, 0) + (d.quantity or 0)

        for process, qty in process_map.items():
            if qty > bill_qty:
                frappe.throw(
                    f"Process <b>{process}</b> exceeds Bill Quantity"
                )

    # =========================================================
    # AMOUNT CALCULATION
    # =========================================================
    def total_rows_amount(self):

        total = 0

        for row in self.daily_production_details:
            row.amount = ceil(((row.quantity or 0) * (row.rate or 0)) / 12.0)
            total += row.amount or 0

        self.total_amount = total
    
    def sync_latest_done_quantity(self):

        for row in self.daily_production_colors:

            latest = frappe.db.sql("""
                SELECT
                    COALESCE(
                        MAX(
                            IFNULL(dpc.done_quantity, 0)
                            + IFNULL(dpc.ongoing_quantity, 0)
                        ),
                        0
                    )

                FROM `tabDaily Production Colors` dpc
                INNER JOIN `tabDaily Production` dp
                    ON dp.name = dpc.parent

                WHERE
                    dp.po = %s
                    AND dp.process_type = %s
                    AND dpc.color = %s
                    AND dp.is_revised != 1
                    AND dp.name != %s

            """, (
                self.po,
                self.process_type,
                row.color,
                self.name
            ))[0][0] or 0

            current = row.done_quantity or 0

            # =====================================================
            # 🔥 YOUR CONDITION (IMPORTANT CHANGE)
            # =====================================================
            if latest > current:
                row.done_quantity = latest

# =========================================================
# ⭐ API: GET MAX (done + ongoing)
# =========================================================
@frappe.whitelist()
def get_done_quantity(po, color, process_type, current_doc=None):

    if not (po and color and process_type):
        return 0

    max_value = frappe.db.sql("""
        SELECT
            COALESCE(
                MAX(
                    IFNULL(dpc.done_quantity, 0)
                    + IFNULL(dpc.ongoing_quantity, 0)
                ),
                0
            )

        FROM `tabDaily Production Colors` dpc
        INNER JOIN `tabDaily Production` dp
            ON dp.name = dpc.parent

        WHERE
            dp.po = %s
            AND dp.process_type = %s
            AND dpc.color = %s
            AND dp.is_revised != 1
            AND (%s IS NULL OR dp.name != %s)

    """, (po, process_type, color, current_doc, current_doc))[0][0] or 0

    return max_value
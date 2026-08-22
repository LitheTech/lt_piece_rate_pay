import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import ceil


class DailyProduction(Document):

    def before_insert(self):
        # Force new amendments to always start in 'Draft' state
        if self.amended_from or self.is_new():
            self.workflow_state = "Draft"

    def on_update(self):
        # Triggers on every save/update
        self.handle_parent_rejection_on_approval()

    # =========================================================
    # REJECT PARENT DOCUMENT ONLY WHEN NEW DOC IS APPROVED
    # =========================================================
    def handle_parent_rejection_on_approval(self):
        """
        While this doc is 'Draft', nothing happens to parent doc.
        When this doc becomes 'Approved', parent doc becomes 'Rejected'.
        """
        if self.workflow_state == "Approved" and self.amended_from:
            parent_state = frappe.db.get_value("Daily Production", self.amended_from, "workflow_state")
            
            # Change parent document state to 'Rejected'
            if parent_state != "Rejected":
                frappe.db.set_value("Daily Production", self.amended_from, "workflow_state", "Rejected")
                frappe.msgprint(
                    _("Previous document <b>{0}</b> has been marked as <b>Rejected</b>.").format(self.amended_from),
                    alert=True
                )


    # =========================================================
    # MAIN VALIDATE
    # =========================================================
    def validate(self):
        if not self.need_update:
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
            if self.has_sub_process==1:
                if d.process_name:
                    process_map[d.process_name] = process_map.get(d.process_name, 0) + (d.quantity or 0)
            else:
                key = self.process_type or "Main Process"
                process_map[key] = process_map.get(key, 0) + (d.quantity or 0)
        for process, qty in process_map.items():
            if qty > bill_qty:
                frappe.throw(
                    f"Process <b>{process}</b> exceeds Bill Quantity"
                )

    # =========================================================
    # AMOUNT CALCULATION
    # =========================================================
    def total_rows_amount(self):

        salary=0 
        contract=0
        total = 0

        for row in self.daily_production_details:
            row.amount = ceil(((row.quantity or 0) * (row.rate or 0)) / 12.0)
            if row.employee_type== "Contract":
                contract +=row.amount or 0
            elif row.employee_type== "Salary":
                salary +=row.amount or 0
            total += row.amount or 0

        self.contract_amount=contract
        self.salary_amount=salary
        self.total_amount = total
    
    def sync_latest_done_quantity(self):
        doc_before_save = self.get_doc_before_save()
        # -----------------------------------------------------
        # 1. APPROVAL TRANSITION (Draft -> Approved):
        #    Do NOT recalculate. Just freeze what was in Draft.
        # -----------------------------------------------------
        if doc_before_save and doc_before_save.workflow_state == "Draft" and self.workflow_state == "Approved":
            prev_colors = {(d.style, d.color): d.done_quantity for d in doc_before_save.daily_production_colors}

            for row in self.daily_production_colors:
                key = (row.style, row.color)
                if key in prev_colors and prev_colors[key] is not None:
                    row.done_quantity = prev_colors[key]
            return

        # -----------------------------------------------------
        # 2. AMENDMENT (First Save):
        #    Copy exact done_quantity from the parent document
        # -----------------------------------------------------
        if self.amended_from and (self.is_new() or self.workflow_state == "Draft"):

            parent_colors = frappe.db.get_all(
                "Daily Production Colors",
                filters={"parent": self.amended_from},
                fields=["style", "color", "done_quantity"]
            )
            parent_map = {(d.style, d.color): d.done_quantity for d in parent_colors}

            for row in self.daily_production_colors:
                key = (row.style, row.color)
                if key in parent_map:
                    row.done_quantity = parent_map[key] or 0
            return

        # Extract base document name (e.g. 'DP-2026-0035' from 'DP-2026-0035-6')
        root_name = self.name.split('-')[0] + '-' + self.name.split('-')[1] + '-' + self.name.split('-')[2] if self.name and len(self.name.split('-')) >= 3 else self.name

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
                    AND dpc.style = %s
                    AND dpc.color = %s
                    AND dp.workflow_state IN ('Approved', 'Draft')
                    AND dp.is_revised != 1
                    AND dp.name != %s
                    AND (%s IS NULL OR dp.name NOT LIKE %s)
            """, (
                self.po,
                self.process_type,
                row.style,
                row.color,
                self.name,
                root_name,
                f"{root_name}%"
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
def get_done_quantity(po, style, color, process_type, current_doc=None):

    if not (po and style and color and process_type):
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
            AND dpc.style = %s
            AND dpc.color = %s
            AND dp.is_revised != 1
            AND (%s IS NULL OR dp.name != %s)

    """, (po, process_type, style, color, current_doc, current_doc))[0][0] or 0

    return max_value
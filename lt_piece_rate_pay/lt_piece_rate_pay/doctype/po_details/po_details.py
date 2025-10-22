# Copyright (c) 2025, Lithe-Tech LTD and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class PODetails(Document):
	pass

@frappe.whitelist()
def get_styles_for_po(po=None):
    """
    Fetch only styles linked to a specific PO's child table.
    Returns a list of {value, label} dicts for Link dropdown.
    """

    if not po:
        return []

    # Replace 'PO Details' with your actual child table name
    rows = frappe.db.sql("""
        SELECT DISTINCT pd.style,pd.quantity,pd.color
        FROM `tabPO Details` pd
        WHERE pd.parent = %s
        ORDER BY pd.style ASC
    """, values=[po], as_dict=True)
    # frappe.msgprint(f"get_styles_for_po() called with: {rows}")

    # Convert to list of dicts for dropdown
    # return [{"value": r["style"], "label": r["style"]} for r in rows if r.get("style")]
    return rows
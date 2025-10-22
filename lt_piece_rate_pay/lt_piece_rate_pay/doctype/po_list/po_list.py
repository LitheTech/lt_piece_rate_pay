# Copyright (c) 2025, Lithe-Tech LTD and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

class POList(Document):
	def validate(self):
		self.calculate_total_quantity()

	def calculate_total_quantity(self):
			total_pieces = 0
			for row in self.po_details:
				total_pieces += row.quantity
			self.total_quantity= total_pieces
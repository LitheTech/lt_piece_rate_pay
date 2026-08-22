# Copyright (c) 2025, Lithe-Tech LTD and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

class Process(Document):
	def validate(self):
        # Update default_rate whenever the state becomes Approved/Accepted
		if self.workflow_state in ["Approved", "Accepted"] and self.new_rate:
			self.default_rate = self.new_rate



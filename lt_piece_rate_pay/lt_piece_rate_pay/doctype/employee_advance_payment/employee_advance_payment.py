# Copyright (c) 2026, Lithe-Tech LTD and contributors
# For license information, please see license.txt

import frappe
import json
from frappe import _, bold
from frappe.model.document import Document
from frappe.utils import date_diff, flt, formatdate, get_last_day, get_link_to_form, getdate
from six import string_types

from frappe.model.document import Document

class EmployeeAdvancePayment(Document):
	pass


@frappe.whitelist()
def get_total_advance(employee, contract_worker_payroll_entry):
	"""Encapsulates the database query inside its own domain model."""
	if not (employee and contract_worker_payroll_entry):
		return 0.0

	data = frappe.db.sql("""
		SELECT SUM(amount) AS total_advance
		FROM `tabEmployee Advance Payment`
		WHERE employee = %s 
		AND contract_worker_payroll_entry = %s
	""", (employee, contract_worker_payroll_entry), as_dict=True)
	
	return flt(data[0].total_advance) if data and data[0].total_advance else 0.0



@frappe.whitelist()
def create_advance_assignment_for_multiple_employees(employees, data):

	if isinstance(employees, string_types):
		employees = json.loads(employees)

	if isinstance(data, string_types):
		data = frappe._dict(json.loads(data))

	docs_name = []
	for employee in employees:
		assignment = frappe.new_doc("Employee Advance Payment")
		assignment.employee = employee
		assignment.amount = data.amount or None
		assignment.contract_worker_payroll_entry = data.contract_worker_payroll_entry or None
		assignment.floor = data.floor or None
		assignment.facility_or_line = data.line
		assignment.save()
		# try:
		# 	assignment.submit()
		# except frappe.exceptions.ValidationError:
		# 	continue

		frappe.db.commit()

		docs_name.append(assignment.name)

	return docs_name
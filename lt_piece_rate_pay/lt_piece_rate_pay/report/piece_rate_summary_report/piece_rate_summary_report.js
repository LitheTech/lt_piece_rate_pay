// Copyright (c) 2025, Lithe-Tech LTD and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Piece Rate Summary Report"] = {
	"filters": [
        {
            "fieldname": "contract_worker_payroll_entry",
            "label": __("Contract Worker Payroll Entry"),
            "fieldtype": "Link",
            "options": "Contract Worker Payroll Entry",
            "reqd": 1
        },
        // {
        //     "fieldname": "company",
        //     "label": __("Company"),
        //     "fieldtype": "Link",
        //     "options": "Company"
        // },
        // {
        //     "fieldname": "from_date",
        //     "label": __("From Date"),
        //     "fieldtype": "Date"
        // },
        // {
        //     "fieldname": "to_date",
        //     "label": __("To Date"),
        //     "fieldtype": "Date"
        // }

	]
};

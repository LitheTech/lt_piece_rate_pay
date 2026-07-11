// Copyright (c) 2026, Lithe-Tech LTD and contributors
// For license information, please see license.txt

frappe.ui.form.on('Employee Advance Payment', {
	// refresh: function(frm) {

	// }
	floor: function(frm) {
        frm.set_query("facility_or_line", function() {
            return frm.doc.floor ? { filters: { floor: frm.doc.floor } } : {};
        });
    },
});

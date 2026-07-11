frappe.ui.form.on("Daily Production", {

    floor: function(frm) {
        frm.set_query("facility_or_line", function() {
            return frm.doc.floor ? { filters: { floor: frm.doc.floor } } : {};
        });
    },

    // ================= PO =================
    po: function(frm) {
        if (!frm.doc.po) {
            reset_all(frm);
            return;
        }

        frappe.call({
            method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.po_details.po_details.get_styles_for_po",
            args: { po: frm.doc.po },
            callback: function(r) {

                frm.allowed_styles_data = r.message || [];

                // unique styles
                frm.allowed_styles = [...new Set(
                    frm.allowed_styles_data.map(d => d.style)
                )];

                // 🔥 refresh child table
                frm.refresh_field("daily_production_colors");
            }
        });
    },

    // ================= REFRESH =================
    refresh: function(frm) {

        if (frm.doc.po) {
            frappe.call({
                method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.po_details.po_details.get_styles_for_po",
                args: { po: frm.doc.po },
                callback: function(r) {

                    frm.allowed_styles_data = r.message || [];
                    frm.allowed_styles = [...new Set(
                        frm.allowed_styles_data.map(d => d.style)
                    )];
                }
            });
        }

        // 🔥 PROCESS FILTER
        frm.fields_dict["daily_production_details"].grid
            .get_field("process_name").get_query = function() {
                return {
                    filters: {
                        parent_process: frm.doc.process_type || ""
                    }
                };
            };

        frm.fields_dict["daily_production_details"].grid
            .get_field("employee").get_query = function() {
                return {
                    filters: {
                        status: "Active"
                    }
                };
            };

        // 🔥 VALIDATION LISTENER
        if (!frm._qty_listener_attached) {
            frm._qty_listener_attached = true;

            const grid = frm.fields_dict["daily_production_details"].grid;

            $(grid.wrapper).on("change", 'input[data-fieldname="quantity"]', function() {
                let row_name = $(this).closest(".grid-row").attr("data-name");
                validate_child_quantity(frm, row_name);
            });
        }
    },

    process_type: function(frm) {

        (frm.doc.daily_production_colors || []).forEach(row => {
            update_done_quantity(frm, row.doctype, row.name);
        });

        frm.refresh_field("daily_production_details");
    }
});


// ================= CHILD TABLE =================
frappe.ui.form.on("Daily Production Colors", {

    daily_production_colors_add: function(frm, cdt, cdn) {
        set_style_query(frm);
    },

    // 🔥 STYLE SELECTED
    style: function(frm, cdt, cdn) {

        let row = locals[cdt][cdn];

        // reset color
        frappe.model.set_value(cdt, cdn, "color", "");

        // 🔥 set color options for THIS style
        set_color_options(frm, row.style);
    },

    color: function(frm, cdt, cdn) {
        update_color_quantity(frm, cdt, cdn);
    }
});

// ================= DETAILS CHILD TABLE =================
frappe.ui.form.on("Daily Production Details", {
    quantity: function(frm, cdt, cdn) {
        validate_child_quantity(frm, cdn);
    },
    process_name: function(frm, cdt, cdn) {
        validate_child_quantity(frm, cdn);
    }
});


// ================= HELPERS =================

// 🔹 STYLE QUERY
function set_style_query(frm) {

    let grid = frm.fields_dict["daily_production_colors"].grid;

    grid.get_field("style").get_query = function() {
        return {
            filters: {
                name: ["in", frm.allowed_styles || []]
            }
        };
    };
}


// 🔹 SET COLOR OPTIONS (IMPORTANT CHANGE)
function set_color_options(frm, style) {

    if (!style) return;

    let colors = (frm.allowed_styles_data || [])
        .filter(d => d.style === style)
        .map(d => d.color)
        .filter(c => c);

    // remove duplicates
    colors = [...new Set(colors)];

    let grid = frm.fields_dict["daily_production_colors"].grid;

    grid.update_docfield_property("color", "options", ["", ...colors]);

    frm.refresh_field("daily_production_colors");
}


// 🔹 COLOR QUANTITY
function update_color_quantity(frm, cdt, cdn) {

    let row = locals[cdt][cdn];

    if (!(row.color && row.style && frm.allowed_styles_data)) return;

    let selected = frm.allowed_styles_data.find(
        d => d.style === row.style && d.color === row.color
    );

    frappe.model.set_value(
        cdt,
        cdn,
        "color_quantity",
        selected ? selected.quantity || 0 : 0
    );

    if (frm.doc.process_type) {
        update_done_quantity(frm, cdt, cdn);
    }
}


// 🔹 DONE QUANTITY (UNCHANGED)
function update_done_quantity(frm, cdt, cdn) {

    let row = locals[cdt][cdn];

    if (!(row.color && frm.doc.process_type && frm.doc.po)) return;

    frappe.call({
        method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.daily_production.daily_production.get_done_quantity",
        args: {
            po: frm.doc.po,
            style:row.style,
            color: row.color,
            process_type: frm.doc.process_type,
            current_doc: frm.doc.name || null
        },
        callback: function(r) {
            frappe.model.set_value(cdt, cdn, "done_quantity", r.message || 0);
        }
    });
}


// 🔹 RESET
function reset_all(frm) {
    frm.allowed_styles_data = [];
    frm.allowed_styles = [];

    frm.clear_table("daily_production_colors");
    frm.refresh_field("daily_production_colors");
}

// 🔹 VALIDATE DETAILS QUANTITY AGAINST BILL QUANTITY
function validate_child_quantity(frm, row_name) {
    let bill_qty = frm.doc.bill_quantity || 0;
    
    // 1. Calculate the total quantity for each process currently in the child table
    let process_totals = {};
    
    (frm.doc.daily_production_details || []).forEach(row => {
        if (row.process_name) {
            process_totals[row.process_name] = (process_totals[row.process_name] || 0) + (row.quantity || 0);
        }
    });

    // 2. Find the process name of the row that was just modified
    let changed_row = frappe.get_doc("Daily Production Details", row_name);
    if (!changed_row || !changed_row.process_name) return;

    let total_for_this_process = process_totals[changed_row.process_name] || 0;

    // 3. Throw an alert if it exceeds bill quantity
    if (total_for_this_process > bill_qty) {
        
        // Reset the value back to 0 or reduce it to prevent sticking invalid data
        frappe.model.set_value(changed_row.doctype, changed_row.name, "quantity", 0);
        
        frappe.msgprint({
            title: __('Quantity Exceeded'),
            indicator: 'orange',
            message: __(
                "⚠️ Process <b>{0}</b> total quantity (<b>{1}</b>) cannot exceed the Bill Quantity (<b>{2}</b>).<br>The field has been reset.", 
                [changed_row.process_name, total_for_this_process, bill_qty]
            )
        });
    }
}
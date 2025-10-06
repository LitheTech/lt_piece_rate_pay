frappe.ui.form.on("Daily Production", {
    po: function(frm) {
        if (frm.doc.po) {
            frappe.call({
                method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.po_details.po_details.get_styles_for_po",
                args: { po: frm.doc.po },
                callback: function(r) {
                    if (r.message && r.message.length > 0) {
                        // ✅ store both style + quantity
                        frm.allowed_styles_data = r.message;              // [{style, quantity}, ...]
                        frm.allowed_styles = r.message.map(d => d.style); // ["style1", "style2"]

                        // Apply Link field filter
                        frm.set_query("style_list", function() {
                            return { filters: { name: ["in", frm.allowed_styles] } };
                        });

                        // Reset fields
                        frm.set_value("style_list", "");
                        frm.set_value("total_quantity", 0);
                        frm.set_value("completed_quantity", 0);
                    } else {
                        frm.allowed_styles_data = [];
                        frm.allowed_styles = [];
                        frm.set_query("style_list", function() {
                            return { filters: { name: ["in", []] } };
                        });
                        frm.set_value("style_list", "");
                        frm.set_value("total_quantity", 0);
                        frm.set_value("completed_quantity", 0);
                    }
                }
            });
        } else {
            frm.allowed_styles_data = [];
            frm.allowed_styles = [];
            frm.set_query("style_list", function() {
                return { filters: { name: ["in", []] } };
            });
            frm.set_value("style_list", "");
            frm.set_value("total_quantity", 0);
            frm.set_value("completed_quantity", 0);
        }
    },

    style_list: function(frm) {
        if (frm.doc.style_list && frm.allowed_styles_data) {
            // ✅ get total_quantity from allowed_styles_data
            let selected = frm.allowed_styles_data.find(d => d.style === frm.doc.style_list);
            if (selected) {
                frm.set_value("total_quantity", selected.quantity || 0);

                // ✅ fetch completed quantity from Daily Production
                frappe.call({
                    method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.daily_production.daily_production.get_completed_quantity",
                    args: {
                        po: frm.doc.po,
                        style: frm.doc.style_list,
                    },
                    callback: function(r) {
                        frm.set_value("completed_quantity", r.message || 0);
                        validate_totals(frm);  // 🔥 run validation immediately
                    }
                });

            } else {
                frm.set_value("total_quantity", 0);
                frm.set_value("completed_quantity", 0);
            }
        } else {
            frm.set_value("total_quantity", 0);
            frm.set_value("completed_quantity", 0);
        }
    },

    process_type: function(frm) {
        if (frm.doc.process_type && frm.doc.style_list && frm.allowed_styles_data) {
            let selected = frm.allowed_styles_data.find(d => d.style === frm.doc.style_list);
            if (selected) {
                frm.set_value("total_quantity", selected.quantity || 0);

                frappe.call({
                    method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.daily_production.daily_production.get_completed_quantity",
                    args: {
                        po: frm.doc.po,
                        style: frm.doc.style_list,
                        process_type: frm.doc.process_type || null
                    },
                    callback: function(r) {
                        frm.set_value("completed_quantity", r.message || 0);
                        validate_totals(frm);  // 🔥 run validation immediately
                    }
                });

            } else {
                frm.set_value("completed_quantity", 0);
            }
        } else {
            frm.set_value("completed_quantity", 0);
        }
    },

    bill_quantity: function(frm) {
        validate_totals(frm);
        validate_process_quantities(frm);
    },
    total_quantity: function(frm) {
        validate_totals(frm);
    },
    completed_quantity: function(frm) {
        validate_totals(frm);
    },

    refresh: function(frm) {
        // ✅ Add filter for child table field (process_name)
        frm.fields_dict["daily_production_details"].grid.get_field("process_name").get_query = function(doc, cdt, cdn) {
            return {
                filters: {
                    parent_process: frm.doc.process_type || ""
                }
            };
        };
    }
});



// ==================== Helper Functions ====================

function validate_totals(frm) {
    let total_qty = frm.doc.total_quantity || 0;
    let completed_qty = frm.doc.completed_quantity || 0;
    let bill_qty = frm.doc.bill_quantity || 0;

    if ((completed_qty + bill_qty) > total_qty) {
        frappe.msgprint({
            title: __("Quantity Mismatch"),
            indicator: "red",
            message: __(
                `Total Quantity cannot be less than Completed + Bill. 
                <br><b>Total:</b> ${total_qty}, 
                <b>Completed + Bill:</b> ${completed_qty + bill_qty}`
            )
        });
    }
}

frappe.ui.form.on("Daily Production", {
    refresh: function(frm) {
        // Attach listener once
        if (!frm._qty_listener_attached) {
            frm._qty_listener_attached = true;

            let grid = frm.fields_dict["daily_production_details"].grid;
            $(grid.wrapper).on("change", 'input[data-fieldname="quantity"]', function () {
                let row_name = $(this).closest(".grid-row").attr("data-name");
                validate_child_quantity(frm, row_name);
            });
        }
    }
});

function validate_child_quantity(frm, row_name) {
    const bill_qty = Number(frm.doc.bill_quantity) || 0;
    const rows = frm.doc.daily_production_details || [];

    // Find the row being edited
    const row = rows.find(r => r.name === row_name);
    if (!row || !row.process_name) return;

    // Get the live input value (so it counts what the user just typed)
    const live_value = Number($(`.grid-row[data-name="${row_name}"] input[data-fieldname="quantity"]`).val()) || 0;

    // Calculate total for this process including the live value
    let total_for_process = 0;
    rows.forEach(r => {
        if (r.process_name === row.process_name) {
            if (r.name === row_name) {
                total_for_process += live_value;
            } else {
                total_for_process += Number(r.quantity) || 0;
            }
        }
    });

    if (total_for_process > bill_qty) {
        const remaining = Math.max(0, bill_qty - (total_for_process - live_value));
        frappe.model.set_value("Daily Production Detail", row_name, "quantity", remaining);
        $(`.grid-row[data-name="${row_name}"] input[data-fieldname="quantity"]`).val(remaining);

        frappe.msgprint({
            title: __("Quantity Exceeded"),
            indicator: "red",
            message: `Total for Process <b>${row.process_name}</b> (${total_for_process}) exceeds Bill Quantity (${bill_qty}).`
        });
    }
}

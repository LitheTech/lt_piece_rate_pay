frappe.ui.form.on("Daily Production", {
    // 🏠 Floor → filter facility_or_line
    floor: function(frm) {
        frm.set_query("facility_or_line", function() {
            if (frm.doc.floor) {
                return { filters: { floor: frm.doc.floor } };
            }
            return {}; // show all if no floor selected
        });
    },

    // 📦 PO → fetch styles + reset dependent fields
    po: function(frm) {
        if (!frm.doc.po) {
            reset_style_data(frm);
            return;
        }

        frappe.call({
            method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.po_details.po_details.get_styles_for_po",
            args: { po: frm.doc.po },
            callback: function(r) {
                frm.allowed_styles_data = r.message || [];
                frm.allowed_styles = [...new Set(frm.allowed_styles_data.map(d => d.style))];

                frm.set_query("style_list", () => ({
                    filters: { name: ["in", frm.allowed_styles] }
                }));

                // Reset only when PO changes manually
                frm.set_value({
                    style_list: "",
                    color: "",
                    total_quantity: 0,
                    completed_quantity: 0
                });
            }
        });
    },

    // 👗 Style selected → populate color options
    style_list: function(frm) {
        if (!frm.doc.style_list || !frm.allowed_styles_data) return;

        let colors = frm.allowed_styles_data
            .filter(d => d.style === frm.doc.style_list)
            .map(d => d.color)
            .filter(c => c);

        frm.fields_dict.color.df.options = ["", ...colors];
        frm.refresh_field("color");

        // ✅ Only clear color if not valid anymore
        if (!colors.includes(frm.doc.color)) {
            frm.set_value("color", "");
        }

        // Reset totals
        frm.set_value({
            total_quantity: 0,
            completed_quantity: 0
        });
    },

    // 🎨 Color selected → fetch total + completed qty
    color: function(frm) {
        if (!(frm.doc.color && frm.doc.style_list && frm.doc.po)) return;

        let selected = (frm.allowed_styles_data || []).find(
            d => d.style === frm.doc.style_list && d.color === frm.doc.color
        );

        if (!selected) {
            frm.set_value({
                total_quantity: 0,
                completed_quantity: 0
            });
            return;
        }

        frm.set_value("total_quantity", selected.quantity || 0);

        frappe.call({
            method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.daily_production.daily_production.get_completed_quantity",
            args: {
                po: frm.doc.po,
                style: frm.doc.style_list,
                color: frm.doc.color,
                process_type: frm.doc.process_type || null
            },
            callback: function(r) {
                frm.set_value("completed_quantity", r.message || 0);
            }
        });
    },

    // ⚙️ Process Type selected → recheck completed qty
    process_type: function(frm) {
        if (!(frm.doc.process_type && frm.doc.style_list && frm.doc.color && frm.allowed_styles_data)) {
            frm.set_value("completed_quantity", 0);
            return;
        }

        let selected = frm.allowed_styles_data.find(
            d => d.style === frm.doc.style_list && d.color === frm.doc.color
        );

        if (!selected) return;

        frm.set_value("total_quantity", selected.quantity || 0);

        frappe.call({
            method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.daily_production.daily_production.get_completed_quantity",
            args: {
                po: frm.doc.po,
                style: frm.doc.style_list,
                color: frm.doc.color,
                process_type: frm.doc.process_type || null
            },
            callback: function(r) {
                frm.set_value("completed_quantity", r.message || 0);
                validate_totals(frm);
            }
        });
    },

    // 🧮 Validation triggers
    bill_quantity: validate_all,
    total_quantity: validate_all,
    completed_quantity: validate_all,

    // 🔄 Refresh → restore color & queries after reload
    refresh: function(frm) {
        // Rebuild color dropdown on load
        if (frm.doc.po) {
            frappe.call({
                method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.po_details.po_details.get_styles_for_po",
                args: { po: frm.doc.po },
                callback: function(r) {
                    frm.allowed_styles_data = r.message || [];
                    frm.allowed_styles = [...new Set(frm.allowed_styles_data.map(d => d.style))];

                    frm.set_query("style_list", () => ({
                        filters: { name: ["in", frm.allowed_styles] }
                    }));

                    if (frm.doc.style_list) {
                        let colors = frm.allowed_styles_data
                            .filter(d => d.style === frm.doc.style_list)
                            .map(d => d.color)
                            .filter(c => c);

                        frm.fields_dict.color.df.options = ["", ...colors];
                        frm.refresh_field("color");

                        // keep saved color if valid
                        if (!colors.includes(frm.doc.color)) {
                            frm.set_value("color", "");
                        }
                    }
                }
            });
        }

        // Child table query filter
        frm.fields_dict["daily_production_details"].grid.get_field("process_name").get_query = function() {
            return {
                filters: { parent_process: frm.doc.process_type || "" }
            };
        };

        // Attach listener once
        if (!frm._qty_listener_attached) {
            frm._qty_listener_attached = true;
            const grid = frm.fields_dict["daily_production_details"].grid;

            $(grid.wrapper).on("change", 'input[data-fieldname="quantity"]', function() {
                let row_name = $(this).closest(".grid-row").attr("data-name");
                validate_child_quantity(frm, row_name);
            });
        }
    }
});

// ==================== Helper Functions ====================

function reset_style_data(frm) {
    frm.allowed_styles_data = [];
    frm.allowed_styles = [];
    frm.set_query("style_list", () => ({ filters: { name: ["in", []] } }));
    frm.set_value({
        style_list: "",
        color: "",
        total_quantity: 0,
        completed_quantity: 0
    });
}

function validate_all(frm) {
    validate_totals(frm);
    validate_process_quantities(frm);
}

function validate_totals(frm) {
    const total_qty = frm.doc.total_quantity || 0;
    const completed_qty = frm.doc.completed_quantity || 0;
    const bill_qty = frm.doc.bill_quantity || 0;

    if ((completed_qty + bill_qty > total_qty) && frm.doc.is_revised == 0) {
        frappe.msgprint({
            title: __("Quantity Mismatch"),
            indicator: "red",
            message: __(
                `Total Quantity cannot be less than Completed + Bill.<br>
                <b>Total:</b> ${total_qty}, <b>Completed + Bill:</b> ${completed_qty + bill_qty}`
            )
        });
    }
}

// ================== Validate Child Quantities ==================
function validate_child_quantity(frm, row_name) {
    const bill_qty = Number(frm.doc.bill_quantity) || 0;
    const rows = frm.doc.daily_production_details || [];

    const live_quantities = {};
    $(".grid-row[data-name]").each(function() {
        const row_id = $(this).attr("data-name");
        const val = Number($(this).find('input[data-fieldname="quantity"]').val()) || 0;
        live_quantities[row_id] = val;
    });

    const row = rows.find(r => r.name === row_name);
    if (!row) return;

    const live_value = live_quantities[row_name] || 0;

    if (frm.doc.has_sub_process) {
        if (!row.process_name) return;

        let total_for_process = 0;
        rows.forEach(r => {
            if (r.process_name === row.process_name)
                total_for_process += Number(r.quantity) || 0;
        });

        if (total_for_process > bill_qty) {
            const remaining = Math.max(0, bill_qty - (total_for_process - live_value));
            frappe.model.set_value("Daily Production Detail", row_name, "quantity", remaining);

            $(`.grid-row[data-name="${row_name}"] input[data-fieldname="quantity"]`).val(remaining);
            frm.refresh_field("daily_production_details");

            frappe.msgprint({
                title: __("Quantity Exceeded"),
                indicator: "red",
                message: `Total for Process <b>${row.process_name}</b> (${total_for_process}) exceeds Bill Quantity (${bill_qty}).`
            });
        }
    } else {
        let total_qty = 0;
        rows.forEach(r => (total_qty += Number(r.quantity) || 0));

        if (total_qty > bill_qty) {
            const remaining = Math.max(0, bill_qty - (total_qty - live_value));
            frappe.model.set_value("Daily Production Detail", row_name, "quantity", remaining);

            $(`.grid-row[data-name="${row_name}"] input[data-fieldname="quantity"]`).val(remaining);
            frm.refresh_field("daily_production_details");

            frappe.msgprint({
                title: __("Quantity Exceeded"),
                indicator: "red",
                message: `Total Quantity (${total_qty}) exceeds Bill Quantity (${bill_qty}).`
            });
        }
    }
}

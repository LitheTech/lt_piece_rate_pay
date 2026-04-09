frappe.ui.form.on("Daily Production", {

    floor: function(frm) {
        frm.set_query("facility_or_line", function() {
            return frm.doc.floor ? { filters: { floor: frm.doc.floor } } : {};
        });
    },

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
                frm.allowed_styles = [...new Set(frm.allowed_styles_data.map(d => d.style))];

                frm.set_query("style_list", () => ({
                    filters: { name: ["in", frm.allowed_styles] }
                }));

                frm.set_value("style_list", "");
                frm.clear_table("daily_production_colors");
                frm.refresh_field("daily_production_colors");
            }
        });
    },

    style_list: function(frm) {
        frm.clear_table("daily_production_colors");
        frm.refresh_field("daily_production_colors");
        load_color_options(frm);
    },

    refresh: function(frm) {

        // 🔹 reload styles
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

                    load_color_options(frm);
                }
            });
        }

        // 🔥 PROCESS NAME FILTER (IMPORTANT)
        frm.fields_dict["daily_production_details"].grid.get_field("process_name").get_query = function() {
            return {
                filters: {
                    parent_process: frm.doc.process_type || ""
                }
            };
        };

        // 🔥 LIVE VALIDATION LISTENER (IMPORTANT)
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

        // 🔹 update done qty for color table
        (frm.doc.daily_production_colors || []).forEach(row => {
            update_done_quantity(frm, row.doctype, row.name);
        });

        // 🔹 refresh process_name filter
        frm.refresh_field("daily_production_details");
    }

});


// ================= CHILD TABLE (COLOR) =================
frappe.ui.form.on("Daily Production Colors", {

    daily_production_colors_add: function(frm, cdt, cdn) {
        set_row_query(frm, cdt, cdn);
    },

    daily_production_colors_remove: function(frm) {
        (frm.doc.daily_production_colors || []).forEach(r => {
            set_row_query(frm, r.doctype, r.name);
        });
    },

    color: function(frm, cdt, cdn) {
        update_color_quantity(frm, cdt, cdn);
    }
});


// ================= HELPERS =================

function set_row_query(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    if (!frm.doc.style_list || !frm.doc.po) return;

    let all_colors = (frm.allowed_styles_data || [])
        .filter(d => d.style === frm.doc.style_list)
        .map(d => d.color)
        .filter(c => c);

    let selected_colors = (frm.doc.daily_production_colors || [])
        .map(r => r.color)
        .filter(c => c && c !== row.color);

    let available = all_colors.filter(c => !selected_colors.includes(c));

    frm.fields_dict.daily_production_colors.grid.get_field("color").get_query = function(doc, cdt2, cdn2) {
        if (cdn2 !== cdn) return { filters: {} };
        return { filters: { name: ["in", available] } };
    };

    frm.fields_dict.daily_production_colors.grid.refresh();
}


// 🔹 COLOR QUANTITY
function update_color_quantity(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    if (!(row.color && frm.doc.style_list && frm.allowed_styles_data)) return;

    let selected = frm.allowed_styles_data.find(
        d => d.style === frm.doc.style_list && d.color === row.color
    );

    frappe.model.set_value(cdt, cdn, "color_quantity", selected ? selected.quantity || 0 : 0);

    if (frm.doc.process_type) {
        update_done_quantity(frm, cdt, cdn);
    }
}


// 🔹 DONE QUANTITY
function update_done_quantity(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    if (!(row.color && frm.doc.process_type && frm.doc.po)) return;

    frappe.call({
        method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.daily_production.daily_production.get_done_quantity",
        args: {
            po: frm.doc.po,
            color: row.color,
            process_type: frm.doc.process_type,
            current_doc: frm.doc.name || null
        },
        callback: function(r) {
            frappe.model.set_value(cdt, cdn, "done_quantity", r.message || 0);
        }
    });

    (frm.doc.daily_production_colors || []).forEach(r => {
        set_row_query(frm, r.doctype, r.name);
    });
}


// 🔹 COLOR OPTIONS
function load_color_options(frm) {
    if (!frm.doc.style_list) return;

    let colors = (frm.allowed_styles_data || [])
        .filter(d => d.style === frm.doc.style_list)
        .map(d => d.color)
        .filter(c => c);

    apply_color_options(frm, colors);
}

function apply_color_options(frm, colors) {
    let grid = frm.fields_dict["daily_production_colors"].grid;
    grid.update_docfield_property("color", "options", ["", ...colors]);
    grid.refresh();
}


// 🔹 RESET
function reset_all(frm) {
    frm.allowed_styles_data = [];
    frm.allowed_styles = [];

    frm.set_query("style_list", () => ({ filters: { name: ["in", []] } }));
    frm.set_value("style_list", "");
    frm.clear_table("daily_production_colors");
    frm.refresh_field("daily_production_colors");
}


// ================= PROCESS VALIDATION =================

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

        rows.forEach(r => total_qty += Number(r.quantity) || 0);

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
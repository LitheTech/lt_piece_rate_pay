frappe.ui.form.on("Daily Production", {
    po: function(frm) {
        if (frm.doc.po) {
            frappe.call({
                method: "lt_piece_rate_pay.lt_piece_rate_pay.doctype.po_details.po_details.get_styles_for_po",
                args: { po: frm.doc.po },
                callback: function(r) {
                    if (r.message && r.message.length > 0) {
                        // ✅ store both style + quantity
                        frm.allowed_styles_data = r.message;              // [{style: "kcd4rew", quantity: 50}, ...]
                        frm.allowed_styles = r.message.map(d => d.style); // ["kcd4rew", "test 2"]

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
                    }
                });

            } else {
                frm.set_value("total_quantity", 0);
                // frm.set_value("completed_quantity", 0);
            }
        } else {
            frm.set_value("total_quantity", 0);
            // frm.set_value("completed_quantity", 0);
        }
    },
    process_type: function(frm) {
        if (frm.doc.process_type && frm.doc.style_list && frm.allowed_styles_data) {
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
                        process_type: frm.doc.process_type || null   // ✅ use frm.doc
                    },
                    callback: function(r) {
                        frm.set_value("completed_quantity", r.message || 0);
                    }
                });

            } else {
                frm.set_value("completed_quantity", 0);
            }
        } else {
            frm.set_value("completed_quantity", 0);
        }
    },
    refresh: function(frm) {
        // ✅ Add filter for child table field (process_name)
        frm.fields_dict["daily_production_details"].grid.get_field("process_name").get_query = function(doc, cdt, cdn) {
            return {
                filters: {
                    parent_process: frm.doc.process_type || ""   // filter based on parent process_type
                }
            };
        };
    }
});

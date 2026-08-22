frappe.ui.form.on('Process', {
    refresh: function(frm) {

        // =========================================================
        // 1. APPROVED STATE: Lock entire document
        // =========================================================
        if (frm.doc.workflow_state === 'Approved') {
            frm.set_read_only(); // Makes all form fields read-only

            // Add button to allow switching back to Draft when a rate change is needed
            // frm.add_custom_button(__('Amend Rate'), function() {
            //     frm.set_value('workflow_state', 'Draft');
            //     frm.save();
            // }, __('Actions'));
            frm.refresh_fields();
        }

        // =========================================================
        // 2. DRAFT STATE
        // =========================================================
        else if (frm.doc.workflow_state === 'Draft') {

            if (frm.is_new()) {
                // BRAND NEW DOCUMENT: Keep all fields editable
                frm.meta.fields.forEach(field => {
                    if (field.fieldname) {
                        const is_read_only = field.fieldname == 'default_rate';
                        frm.set_df_property(field.fieldname, 'read_only', is_read_only ? 1 : 0);
                    }
                });
            } else {
                // EXISTING SAVED DOCUMENT (e.g. after clicking 'Amend Rate'):
                // Lock all fields EXCEPT default_rate
                frm.meta.fields.forEach(field => {
                    if (field.fieldname) {
                        const is_read_only = field.fieldname !== 'new_rate';
                        frm.set_df_property(field.fieldname, 'read_only', is_read_only ? 1 : 0);
                    }
                });
            }
            frm.refresh_fields();
        }
    }
});
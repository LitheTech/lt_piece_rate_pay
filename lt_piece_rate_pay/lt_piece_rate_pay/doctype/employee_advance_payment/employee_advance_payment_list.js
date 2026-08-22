frappe.listview_settings['Employee Advance Payment'] = {
	onload: function (list_view) {
		let me = this;
		list_view.page.add_inner_button(__("Employee Advance Payment"), function () {
			me.dialog = new frappe.ui.form.MultiSelectDialog({
				doctype: "Employee",
				target: cur_list,
				setters: {
					employee_name: '',
					company: '',
				},
				data_fields: [{
					fieldname: 'contract_worker_payroll_entry',
					fieldtype: 'Link',
					options: 'Contract Worker Payroll Entry',
					label: __('	Contract Worker Payroll Entry'),
					reqd: 1
				},
				
				{
					fieldname: 'amount',
					fieldtype: 'Int',
					label: __('Amount'),
					reqd: 1
				},
				{
					fieldtype: "Column Break"
				},
				{
					fieldname: 'floor',
					fieldtype: 'Link',
					options: 'Floor',
					label: __('Floor'),
					reqd: 1,
					onchange: function() {
						// Clear selected line when floor changes
						me.dialog.dialog.set_value('line', '');
					}
				},
				{
					fieldname: 'line',
					fieldtype: 'Link',
					options: 'Facility or Line',
					label: __('Line'),
					reqd: 1,
					get_query: function() {
						let selected_floor = me.dialog.dialog.get_value('floor');
						return {
							filters: {
								floor: selected_floor || ''
							}
						};
					}
				},
				],
				get_query() {
					return {
						filters: {
							status: ['=', 'Active']
						}
					};
				},
				add_filters_group: 1,
				primary_action_label: "Assign",
				action(employees, data) {
					frappe.call({
						method: 'lt_piece_rate_pay.lt_piece_rate_pay.doctype.employee_advance_payment.employee_advance_payment.create_advance_assignment_for_multiple_employees',
						async: false,
						args: {
							employees: employees,
							data: data
						}
					});
					cur_dialog.hide();
				}
			});
		});
	},

	
};

// Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Insurance Approval', {
	refresh: function(frm) {
		frm.set_value("approval_date", frappe.datetime.get_today());
		frm.set_value("approval_validity_end_date", frappe.datetime.get_today())
	}
});

// Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Insurance Approval', {
	refresh: function(frm) {
		frm.set_value("approval_date", frappe.datetime.get_today());
		frm.set_value("approval_validity_end_date", frappe.datetime.get_today())
	},
	reference_dn: function(frm){
		if(frm.doc.reference_dt){
			frappe.call({
				"method": "frappe.client.get",
				args: {
					doctype: frm.doc.reference_dt,
					name: frm.doc.reference_dn
				},
				callback: function (data) {
					frm.set_value("patient", data.message.patient);
					if(data.message.insurance){
						frm.set_value("insurance_assignment", data.message.insurance);
					}
					frm.refresh_fields()
				}
			});
		}
	},
	insurance_assignment: function(frm){
		if(frm.doc.insurance_assignment){
			frappe.call({
				"method": "frappe.client.get",
				args: {
					doctype: "Insurance Assignment",
					name: frm.doc.insurance_assignment
				},
				callback: function (data) {
					frm.set_value("insurance_company", data.message.insurance_company);
					frm.set_value("assignment_validity", data.message.end_date);
					frm.set_value("coverage", data.message.coverage);
					frm.refresh_fields()
				}
			});
			frappe.call({
				method: "erpnext.healthcare.utils.create_insurance_approval_items",
				args: {
					'doctype': frm.doc.reference_dt,
					'docname': frm.doc.reference_dn
				},
				callback: function(r) {
					if(r && r.message){
						frm.doc.items = [];
						r.message.forEach(function(row){
							var item_fields = ['item', 'requested_quantity']
							var child_item=frappe.model.add_child(frm.doc, "Insurance Approval Item", "items")
							$.each(item_fields, function(i, field) {
								frappe.model.set_value(child_item.doctype, child_item.name, field, row[field]);
							});
						});
						frm.refresh_fields()
					}
				}
			});
		}
	}
});

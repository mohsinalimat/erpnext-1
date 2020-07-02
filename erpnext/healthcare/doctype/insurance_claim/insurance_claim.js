// Copyright (c) 2019, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Insurance Claim', {
	setup:function(frm){
		frm.set_query("sales_invoice", function() {
			return {
				filters: {
					patient: frm.doc.patient
				}
			};
		});
		frm.set_query("insurance_assignment", function() {
			return {
				filters: {
					patient: frm.doc.patient
				}
			};
		});
	},
	sales_invoice: function(frm) {
		if(frm.doc.sales_invoice && frm.doc.insurance_assignment){
			frappe.call({
				"method": "erpnext.healthcare.doctype.insurance_claim.insurance_claim.get_claim_item",
				args: {
					sales_invoice: frm.doc.sales_invoice,
					insurance: frm.doc.insurance_assignment
				},
				callback: function (data) {
					console.log(data.message);
					data.message[0].forEach(function(row){
						var item_fields = ['patient', 'patient_name', 'insurance_company', 'insurance_company_name', 'insurance_assignment', 'date_of_service',
							'item_code', 'item_name', 'discount_percentage', 'rate', 'sales_invoice', 'amount', 'insurance_claim_coverage', 'insurance_claim_amount', 'claim_status']
						var child_item=frappe.model.add_child(frm.doc, "Insurance Claim Item", "insurance_claim_item")
						$.each(item_fields, function(i, field) {
								frappe.model.set_value(child_item.doctype, child_item.name, field, row[field]);
						});
					});
					frm.set_value("bill_amount", data.message[1]);
					frm.set_value("claim_amount", data.message[2]);
					frm.refresh_fields()
				}
			});
		}
	},
	insurance_assignment: function(frm) {
		if(frm.doc.insurance_assignment){
			frappe.call({
				"method": "frappe.client.get",
				args: {
					doctype: "Insurance Assignment",
					name: frm.doc.insurance_assignment
				},
				callback: function (data) {
					frm.set_value("insurance_company", data.message.insurance_company);
					frm.set_value("claim_percentage", data.message.coverage);
					frm.refresh_fields()
				}
			});
		}
	},
});

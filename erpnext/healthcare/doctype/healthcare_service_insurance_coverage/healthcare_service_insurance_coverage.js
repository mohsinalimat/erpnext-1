// Copyright (c) 2020, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Healthcare Service Insurance Coverage', {
	refresh: function(frm) {
		frm.set_query('healthcare_insurance_coverage_plan', function(){
				return{
					filters:{
						'is_active': 1
					}
				};
		});
	},
	coverage: function(frm) {
		if (frm.doc.coverage && frm.doc.coverage > 100) {
			frm.set_value('coverage', '')
			frappe.throw(__("Maximum Coverage allowed is 100%"));
		}
	},
	discount: function(frm) {
		if (frm.doc.discount && frm.doc.discount > 100) {
			frm.set_value('discount', '')
			frappe.throw(__("Maximum Discount allowed is 100%"));
		}
	}
});

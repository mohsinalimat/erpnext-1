// Copyright (c) 2017, earthians and contributors
// For license information, please see license.txt

frappe.ui.form.on('Clinical Procedure Template', {
	template: function(frm) {
		if(!frm.doc.item_code)
			frm.set_value("item_code", frm.doc.template);
		if(!frm.doc.description)
			frm.set_value("description", frm.doc.template);
		mark_change_in_item(frm);
	},
	rate: function(frm) {
		mark_change_in_item(frm);
	},
	is_billable: function (frm) {
		mark_change_in_item(frm);
	},
	item_group: function(frm) {
		mark_change_in_item(frm);
	},
	description: function(frm) {
		mark_change_in_item(frm);
	},
	medical_department: function(frm) {
		mark_change_in_item(frm);
	},
	refresh: function(frm) {
		frm.fields_dict["items"].grid.set_column_disp("barcode", false);
		frm.fields_dict["items"].grid.set_column_disp("batch_no", false);
		cur_frm.set_df_property("item_code", "read_only", frm.doc.__islocal ? 0 : 1);
		if(!frm.doc.__islocal) {
			cur_frm.add_custom_button(__('Change Item Code'), function() {
				change_template_code(frm.doc);
			} );
			if(frm.doc.disabled == 1){
				cur_frm.add_custom_button(__('Enable Template'), function() {
					enable_template(frm.doc);
				} );
			}
			else{
				cur_frm.add_custom_button(__('Disable Template'), function() {
					disable_template(frm.doc);
				} );
			}
		}
		frm.set_query("medical_department", function() {
			return {
				filters: {
					'is_diagnostic_speciality': false,
					'is_group': false
				}
			};
		});
		var dfi = frappe.meta.get_docfield("Clinical Procedure Item", "rate", frm.doc.name);
		dfi.hidden = 1;
		var df = frappe.meta.get_docfield("Clinical Procedure Item", "amount", frm.doc.name);
		df.hidden = 1;
		var dfj = frappe.meta.get_docfield("Clinical Procedure Item", "valuation_rate", frm.doc.name);
		dfj.hidden = 1;
	},
	clinical_procedure_check_list_template: function(frm) {
		if(frm.doc.clinical_procedure_check_list_template){
			frappe.call({
				"method": "frappe.client.get",
				args: {
					doctype: "Clinical Procedure Check List Template",
					name: frm.doc.clinical_procedure_check_list_template
				},
				callback: function (data) {
					if(data.message){
						if(data.message.check_lists && data.message.check_lists.length > 0){
							for(let i=0; i<data.message.check_lists.length; i++){
								var nursing_task_item = frappe.model.add_child(frm.doc, 'Clinical Procedure Nursing Task', 'nursing_tasks');
								frappe.model.set_value(nursing_task_item.doctype, nursing_task_item.name, 'check_list', data.message.check_lists[i]['check_list']);
								frappe.model.set_value(nursing_task_item.doctype, nursing_task_item.name, 'task', data.message.check_lists[i]['task']);
								frappe.model.set_value(nursing_task_item.doctype, nursing_task_item.name, 'expected_time', data.message.check_lists[i]['expected_time']);
							}
						}
						frm.refresh_field("nursing_tasks");
					}
				}
			});
		}
	}
});

var mark_change_in_item = function(frm) {
	if(!frm.doc.__islocal){
		frm.doc.change_in_item = 1;
	}
};

var disable_template = function(doc){
	frappe.call({
		method: "erpnext.healthcare.doctype.clinical_procedure_template.clinical_procedure_template.disable_enable_template",
		args: {status: 1, name: doc.name, item_code: doc.item_code, is_billable: doc.is_billable},
		callback: function(){
			cur_frm.reload_doc();
		}
	});
};

var enable_template = function(doc){
	frappe.call({
		method: "erpnext.healthcare.doctype.clinical_procedure_template.clinical_procedure_template.disable_enable_template",
		args: {status: 0, name: doc.name, item_code: doc.item_code, is_billable: doc.is_billable},
		callback: function(){
			cur_frm.reload_doc();
		}
	});
};


var change_template_code = function(doc){
	var d = new frappe.ui.Dialog({
		title:__("Change Template Code"),
		fields:[
			{
				"fieldtype": "Data",
				"label": "Template Code",
				"fieldname": "Item Code",
				reqd:1
			},
			{
				"fieldtype": "Button",
				"label": __("Change Code"),
				click: function() {
					var values = d.get_values();
					if(!values)
						return;
					change_item_code_from_template(values["Item Code"], doc);
					d.hide();
				}
			}
		]
	});
	d.show();
	d.set_values({
		'Item Code': doc.item_code
	});
};

var change_item_code_from_template = function(item_code, doc){
	frappe.call({
		"method": "erpnext.healthcare.doctype.clinical_procedure_template.clinical_procedure_template.change_item_code_from_template",
		"args": {item_code: item_code, doc: doc},
		callback: function () {
			cur_frm.reload_doc();
			frappe.show_alert({
				message: "Item Code renamed successfully",
				indicator: "green"
			});
		}
	});
};

frappe.ui.form.on('Clinical Procedure Item', {
	qty: function(frm, cdt, cdn){
		var d = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, "transfer_qty", d.qty*d.conversion_factor);
		if(frm.doc.doctype == "Clinical Procedure Template"){
			frappe.model.set_value(cdt, cdn, "procedure_qty", d.qty);
		}
		get_uom_details(frm, cdn, cdt);
	},
	uom: function(frm, cdt, cdn){
		get_uom_details(frm, cdn, cdt);
	},
	item_code: function(frm, cdt, cdn) {
		var d = locals[cdt][cdn];
		if(d.item_code && frm.doc.doctype == "Clinical Procedure Template") {
			let args = {
				'item_code'			: d.item_code,
				'transfer_qty'		: d.transfer_qty,
				'quantity'				: d.qty
			};
			return frappe.call({
				doc: frm.doc,
				method: "get_item_details",
				args: args,
				callback: function(r) {
					if(r.message) {
						var d = locals[cdt][cdn];
						$.each(r.message, function(k, v){
							d[k] = v;
						});
						refresh_field("items");
					}
					get_uom_details(frm, cdn, cdt);
				}
			});
		}
	}
});

var get_uom_details = function(frm, cdn, cdt) {
	var d = locals[cdt][cdn];
	if(d.uom && d.item_code && d.qty){
		return frappe.call({
			method: "erpnext.stock.doctype.stock_entry.stock_entry.get_uom_details",
			args: {
				item_code: d.item_code,
				uom: d.uom,
				qty: d.qty
			},
			callback: function(r) {
				if(r.message) {
					frappe.model.set_value(cdt, cdn, r.message);
				}
			}
		});
	}
};

// List Stock items
cur_frm.set_query("item_code", "items", function() {
	return {
		filters: {
			is_stock_item:1,
			has_variants:0
		}
	};
});

// Copyright (c) 2018, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Healthcare Service Unit Type', {
	service_unit_type: function(frm) {
		set_item_details(frm);
		if(!frm.doc.__islocal){
			frm.doc.change_in_item = 1;
		}
	},
	is_billable: function(frm) {
		set_item_details(frm);
	},
	refresh: function(frm) {
		frm.set_df_property("item_code", "read_only", frm.doc.__islocal ? 0 : 1);
		if(!frm.doc.__islocal) {
			if(frm.doc.inpatient_occupancy && frm.doc.is_billable){
				frm.add_custom_button(__('Change Item Code'), function() {
					change_item_code(cur_frm,frm.doc);
				} );
			}
			if(frm.doc.disabled == 1){
				frm.add_custom_button(__('Enable'), function() {
					disable(frm, 0);
				} );
			}
			else{
				frm.add_custom_button(__('Disable'), function() {
					disable(frm, 1);
				} );
			}
			frm.trigger("is_modality");
		}
	},
	rate: function(frm) {
		if(!frm.doc.__islocal){
			frm.doc.change_in_item = 1;
		}
	},
	item_group: function(frm) {
		if(!frm.doc.__islocal){
			frm.doc.change_in_item = 1;
		}
	},
	description: function(frm) {
		if(!frm.doc.__islocal){
			frm.doc.change_in_item = 1;
		}
	},
	is_modality: function(frm) {
		if(frm.doc.is_modality == 1){
			frm.set_value("overlap_appointments", false);
			frm.set_value("allow_procedures", false);
			frm.set_df_property("modality_type", "reqd", true);
			frm.set_df_property("modality_name", "reqd", true);
		}
		else{
			frm.set_df_property("modality_type", "reqd", false);
			frm.set_df_property("modality_name", "reqd", false);
		}
	},
	overlap_appointments: function(frm) {
		if(frm.doc.overlap_appointments == 1){
			frm.set_value("is_modality", false);
		}
	},
	allow_procedures: function(frm) {
		if(frm.doc.allow_procedures == 1){
			frm.set_value("is_modality", false);
		}
	},
});

var disable = function(frm, status){
	var doc = frm.doc;
	frappe.call({
		method: 		"erpnext.healthcare.doctype.healthcare_service_unit_type.healthcare_service_unit_type.disable_enable",
		args: {status: status, doc_name: doc.name, item: doc.item, is_billable: doc.is_billable},
		callback: function(){
			cur_frm.reload_doc();
		}
	});
};

var change_item_code = function(frm, doc){
	var d = new frappe.ui.Dialog({
		title:__("Change Item Code"),
		fields:[
			{
				"fieldtype": "Data",
				"label": "Item Code",
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
					change_item_code_from_unit_type(values["Item Code"], doc);
					d.hide();
				}
			}
		]
	});
	d.show();
	d.set_values({
		'Item Code': frm.doc.item_code
	});

	var change_item_code_from_unit_type = function(item_code, doc){
		frappe.call({
			"method": "erpnext.healthcare.doctype.healthcare_service_unit_type.healthcare_service_unit_type.change_item_code",
			"args": {item: doc.item, item_code: item_code, doc_name: doc.name},
			callback: function () {
				frm.reload_doc();
			}
		});
	};
};

var set_item_details = function(frm) {
	if(frm.doc.service_unit_type && frm.doc.is_billable == 1){
		if(!frm.doc.item_code)
			frm.set_value("item_code", frm.doc.service_unit_type);
		if(!frm.doc.description)
			frm.set_value("description", frm.doc.service_unit_type);
		if(!frm.doc.item_group)
			frm.set_value("item_group", 'Services');
	}
};

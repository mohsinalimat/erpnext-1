// Copyright (c) 2016, ESS LLP and contributors
// For license information, please see license.txt

frappe.ui.form.on('Appointment Type', {
	onload:function(frm){
		frm.set_query('medical_code', () => {
            return {
                filters: {
                    medical_code_standard: frm.doc.medical_code_standard
                }
            }
        })
    },
    refresh: function(frm) {
        frm.set_query('price_list', function () {
			return {
				filters: {'selling': 1}
			};
        });
        frm.set_query('medical_department', 'items', function(doc, cdt, cdn) {
			var item_list = doc.items.map(({medical_department})=> medical_department)
			return{
				filters: [
					['Medical Department', 'name', 'not in', item_list]
				]
			}
		});
    }
});

frappe.ui.form.on('Appointment Type Service Item', {
    op_consulting_charge_item: function(frm, cdt, cdn){
        var d = locals[cdt][cdn];
        if(frm.doc.price_list && d.op_consulting_charge_item){
            frappe.call({
                'method': 'frappe.client.get_value',
                args: {
                    'doctype': 'Item Price',
                    'filters':{
                        'item_code': d.op_consulting_charge_item,
                        'price_list': frm.doc.price_list
                    },
                    'fieldname':['price_list_rate']
                },
                callback: function (data) {
                    if(data.message.price_list_rate){
                        frappe.model.set_value(cdt, cdn,'op_consulting_charge', data.message.price_list_rate)
                    }
                }
            });
        }
    },
    inpatient_visit_charge_item: function(frm, cdt, cdn){
        var d = locals[cdt][cdn];
        if(frm.doc.price_list && d.inpatient_visit_charge_item){
            frappe.call({
                'method': 'frappe.client.get_value',
                args: {
                    'doctype': 'Item Price',
                    'filters':{
                        'item_code': d.inpatient_visit_charge_item,
                        'price_list': frm.doc.price_list
                    },
                    'fieldname':['price_list_rate']
                },
                callback: function (data) {
                    if(data.message.price_list_rate){
                        frappe.model.set_value(cdt, cdn,'inpatient_visit_charge', data.message.price_list_rate)
                    }
                }
            });
        }
    }
});

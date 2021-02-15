// Copyright (c) 2016, ESS and contributors
// For license information, please see license.txt

cur_frm.cscript.custom_refresh = function(doc) {
	cur_frm.toggle_display("sb_sensitivity", doc.sensitivity_toggle=="1");
	cur_frm.toggle_display("organisms_section", doc.sensitivity_toggle=="1");
	cur_frm.toggle_display("sb_special", doc.special_toggle=="1");
	cur_frm.toggle_display("sb_normal", doc.normal_toggle=="1");
};

frappe.ui.form.on('Lab Test', {
	validate: function(frm) {
		get_input_data(frm);
	},
	setup: function(frm) {
		frm.get_field('normal_test_items').grid.editable_fields = [
			{fieldname: 'lab_test_name', columns: 3},
			{fieldname: 'lab_test_event', columns: 2},
			{fieldname: 'result_value', columns: 2},
			{fieldname: 'lab_test_uom', columns: 1},
			{fieldname: 'normal_range', columns: 2}
		];
		frm.get_field('special_test_items').grid.editable_fields = [
			{fieldname: 'lab_test_particulars', columns: 3},
			{fieldname: 'result_value', columns: 7}
		];
	},
	inpatient_record:function(frm) {
		if(frm.doc.inpatient_record){
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Inpatient Record",
					name: frm.doc.inpatient_record
				},
				callback: function(r) {
					if(r.message){
						if(r.message.source){
							frm.set_value("source",r.message.source);
							frm.set_df_property("source", "read_only", 1);
						}
						else {
							frm.set_value("source", "");
							frm.set_df_property("source", "read_only", 0);
						}
						if(r.message.referring_practitioner){
							frm.set_value("referring_practitioner", r.message.referring_practitioner);
							frm.set_df_property("referring_practitioner", "read_only", 1);
						}
						else{
							frm.set_value("referring_practitioner", "");
							frm.set_df_property("referring_practitioner", "read_only", 0);
						}
						if(r.message.insurance){
							frm.set_value("insurance", r.message.insurance);
							frm.set_df_property("insurance", "read_only", 1);
							frm.set_df_property("insurance_approval_number", "reqd", 1);
						}
						else{
							frm.set_value("insurance", "");
							frm.set_df_property("insurance", "read_only", 0);
						}
					}
				}
			});
		}
	},
	source: function(frm){
		if(frm.doc.source=="Direct"){
			frm.set_value("referring_practitioner", "");
			frm.set_df_property("referring_practitioner", "hidden", 1);
		}
		else if(frm.doc.source=="External Referral" || frm.doc.source=="Referral") {
			if(frm.doc.practitioner){
				frm.set_df_property("referring_practitioner", "hidden", 0);
				if(frm.doc.source=="External Referral"){
					frappe.db.get_value("Healthcare Practitioner", frm.doc.practitioner, 'healthcare_practitioner_type', function(r) {
						if(r && r.healthcare_practitioner_type && r.healthcare_practitioner_type=="External"){
							frm.set_value("referring_practitioner", frm.doc.practitioner);
						}
						else{
							frm.set_value("referring_practitioner", "");
						}
					});
					frm.set_df_property("referring_practitioner", "read_only", 0);
				}
				else{
					frappe.db.get_value("Healthcare Practitioner", frm.doc.practitioner, 'healthcare_practitioner_type', function(r) {
						if(r && r.healthcare_practitioner_type && r.healthcare_practitioner_type=="Internal"){
							frm.set_value("referring_practitioner", frm.doc.practitioner);
							frm.set_df_property("referring_practitioner", "read_only", 1);
						}
						else{
							frm.set_value("referring_practitioner", "");
							frm.set_df_property("referring_practitioner", "read_only", 0);
						}
					});
				}
				frm.set_df_property("referring_practitioner", "reqd", 1);
			}
			else{
				frm.set_df_property("referring_practitioner", "read_only", 0);
				frm.set_df_property("referring_practitioner", "hidden", 0);
				frm.set_df_property("referring_practitioner", "reqd", 1);
			}
		}
	},
	insurance: function(frm){
		if(frm.doc.insurance && frm.doc.inpatient_record){
			frm.set_df_property("insurance_approval_number", "reqd", 1);
		}
	},
	refresh :  function(frm){
		refresh_field('normal_test_items');
		refresh_field('special_test_items');
		if(frm.doc.__islocal){
			frm.add_custom_button(__('Get from Patient Encounter'), function () {
				get_lab_test_prescribed(frm);
			});
		}
		else if(frm.doc.sample_collection_details && frm.doc.docstatus==0){
			frm.add_custom_button(__('Print Instructions'), function () {
				frm.meta.default_print_format = "Sample Collection Instructions";
				frm.print_doc();
			});
		}
		if(frm.doc.docstatus==1	&&	frm.doc.status!='Approved'	&&	frm.doc.status!='Rejected'	&&	frappe.defaults.get_default("require_test_result_approval")	&&	frappe.user.has_role("LabTest Approver")){
			frm.add_custom_button(__('Approve'), function() {
				status_update(1,frm);
			});
			frm.add_custom_button(__('Reject'), function() {
				status_update(0,frm);
			});
		}
		if(frm.doc.docstatus==1 && frm.doc.sms_sent==0){
			frm.add_custom_button(__('Send SMS'), function() {
				frappe.call({
					method: "erpnext.healthcare.doctype.healthcare_settings.healthcare_settings.get_sms_text",
					args:{doc: frm.doc.name},
					callback: function(r) {
						if(!r.exc) {
							var emailed = r.message.emailed;
							var printed = r.message.printed;
							make_dialog(frm, emailed, printed);
						}
					}
				});
			});
		}
		frm.set_query("service_unit", function(){
			return {
				filters: {
					"is_group": false
				}
			};
		});
		if(frm.doc.normal_test_items && !frm.doc.__islocal){
			lab_test_html_tables(frm);
		}
		frm.set_query("department", function() {
			return {
				filters: {
					'is_diagnostic_speciality': true,
					'is_group': false
				}
			};
		});
		frm.set_query("requesting_department", function() {
			return {
				filters: {
					'is_group': false
				}
			};
		});
		frm.set_query("referring_practitioner", function() {
			if(frm.doc.source=="External Referral"){
				return {
					filters: {
						'healthcare_practitioner_type': "External"
					}
				};
			}
			else{
				return {
					filters: {
						'healthcare_practitioner_type': "Internal"
					}
				};
			}
		});
		frm.set_query("insurance_subscription", function() {
			return {
				filters: {
					"patient": frm.doc.patient,
					"docstatus": 1
				}
			};
		});
	},
	onload: function (frm) {
		 frm.add_fetch("practitioner", "department", "requesting_department");
		if(frm.is_new()) {
			frm.add_fetch("template", "department", "department");
			frappe.db.get_value("Healthcare Settings", "", "default_practitioner_source", function(r) {
				if(r && r.default_practitioner_source){
					frm.set_value("source", r.default_practitioner_source);
				}
				else{
					frm.set_value("source", "");
				}
			});
		}
		if(frm.doc.employee){
			frappe.call({
				method: "frappe.client.get",
				args:{
					doctype: "Employee",
					name: frm.doc.employee
				},
				callback: function(arg){
					frappe.model.set_value(frm.doctype,frm.docname,"employee_name", arg.message.employee_name);
					frappe.model.set_value(frm.doctype,frm.docname,"employee_designation", arg.message.designation);
				}
			});
		}
		if(frm.doc.source=="Direct"){
			frm.set_value("referring_practitioner", "");
			frm.set_df_property("referring_practitioner", "hidden", 1);
		}
		else if(frm.doc.source=="External Referral" || frm.doc.source=="Referral") {
			if(frm.doc.practitioner){
				frm.set_df_property("referring_practitioner", "hidden", 0);
				if(frm.doc.source=="External Referral"){
					frappe.db.get_value("Healthcare Practitioner", frm.doc.practitioner, 'healthcare_practitioner_type', function(r) {
						if(r && r.healthcare_practitioner_type && r.healthcare_practitioner_type=="External"){
							frm.set_value("referring_practitioner", frm.doc.practitioner);
						}
						else{
							frm.set_value("referring_practitioner", "");
						}
					});
					frm.set_df_property("referring_practitioner", "read_only", 0);
				}
				else{
					frappe.db.get_value("Healthcare Practitioner", frm.doc.practitioner, 'healthcare_practitioner_type', function(r) {
						if(r && r.healthcare_practitioner_type && r.healthcare_practitioner_type=="Internal"){
							frm.set_value("referring_practitioner", frm.doc.practitioner);
							frm.set_df_property("referring_practitioner", "read_only", 1);
						}
						else{
							frm.set_value("referring_practitioner", "");
							frm.set_df_property("referring_practitioner", "read_only", 0);
						}
					});
				}
				frm.set_df_property("referring_practitioner", "reqd", 1);
			}
			else{
				frm.set_df_property("referring_practitioner", "read_only", 0);
				frm.set_df_property("referring_practitioner", "hidden", 0);
				frm.set_df_property("referring_practitioner", "reqd", 1);
			}
		}	frm.set_df_property("normal_test_items", "hidden", 1);
	}
});

frappe.ui.form.on("Lab Test", "patient", function(frm) {
	if(frm.doc.patient){
		frappe.call({
			"method": "erpnext.healthcare.doctype.patient.patient.get_patient_detail",
			args: {
				patient: frm.doc.patient
			},
			callback: function (data) {
				var age = null;
				if(data.message.dob){
					age = calculate_age(data.message.dob);
				}
				frappe.model.set_value(frm.doctype,frm.docname, "patient_age", age);
				frappe.model.set_value(frm.doctype,frm.docname, "patient_sex", data.message.sex);
				frappe.model.set_value(frm.doctype,frm.docname, "email", data.message.email);
				frappe.model.set_value(frm.doctype,frm.docname, "mobile", data.message.mobile);
				frappe.model.set_value(frm.doctype,frm.docname, "report_preference", data.message.report_preference);
			}
		});
		frm.set_query("insurance", function(){
			return{
				filters:{
					"patient": frm.doc.patient,
					"docstatus": 1
				}
			};
		});
	}
});

frappe.ui.form.on('Normal Test Items', {
	normal_test_items_remove: function() {
		frappe.msgprint(__("Not permitted, configure Lab Test Template as required"));
		cur_frm.reload_doc();
	}
});

frappe.ui.form.on('Special Test Items', {
	special_test_items_remove: function() {
		frappe.msgprint(__("Not permitted, configure Lab Test Template as required"));
		cur_frm.reload_doc();
	}
});

var status_update = function(approve,frm){
	var doc = frm.doc;
	var status = null;
	if(approve == 1){
		status = "Approved";
	}
	else {
		status = "Rejected";
	}
	frappe.call({
		method: "erpnext.healthcare.doctype.lab_test.lab_test.update_status",
		args: {status: status, name: doc.name},
		callback: function(){
			cur_frm.reload_doc();
		}
	});
};

var get_lab_test_prescribed = function(frm){
	if(frm.doc.patient){
		frappe.call({
			method:	"erpnext.healthcare.doctype.lab_test.lab_test.get_lab_test_prescribed",
			args:	{patient: frm.doc.patient},
			callback: function(r){
				show_lab_tests(frm, r.message);
			}
		});
	}
	else{
		frappe.msgprint(__("Please select Patient to get Lab Tests"));
	}
};

var show_lab_tests = function(frm, result){
	var d = new frappe.ui.Dialog({
		title: __("Lab Test Prescriptions"),
		fields: [
			{
				fieldtype: "HTML", fieldname: "lab_test"
			}
		]
	});
	var html_field = d.fields_dict.lab_test.$wrapper;
	html_field.empty();
	$.each(result, function(x, y){
		var row = $(repl('<div class="col-xs-12" style="padding-top:12px; text-align:center;" >\
		<div class="col-xs-2"> %(lab_test)s </div>\
		<div class="col-xs-2"> %(encounter)s </div>\
		<div class="col-xs-3"> %(practitioner)s </div>\
		<div class="col-xs-3"> %(date)s </div>\
		<div class="col-xs-1">\
		<a data-name="%(name)s" data-lab-test="%(lab_test)s"\
		data-encounter="%(encounter)s" data-practitioner="%(practitioner)s" \
		data-invoiced="%(invoiced)s" data-source="%(source)s" data-referring-practitioner="%(referring_practitioner)s" \
		data-insurance="%(insurance)s" data-requesting-department="%(visit_department)s" href="#"><button class="btn btn-default btn-xs">Get Lab Test\
		</button></a></div></div>', {name:y[0], lab_test: y[1], encounter:y[2], invoiced:y[3], practitioner:y[4], date:y[5], source:y[6],
		referring_practitioner:y[7], insurance:y[8]? [8]:'', visit_department:y[9]? y[9]:''})).appendTo(html_field);
		row.find("a").click(function() {
			frm.doc.template = $(this).attr("data-lab-test");
			frm.doc.prescription = $(this).attr("data-name");
			frm.doc.practitioner = $(this).attr("data-practitioner");
			frm.doc.source =  $(this).attr("data-source");
			frm.set_df_property("source", "read_only", 1);
			frm.doc.referring_practitioner= $(this).attr("data-referring-practitioner")
			frm.doc.insurance= $(this).attr("data-insurance")
			if(frm.doc.referring_practitioner){
				frm.set_df_property("referring_practitioner", "hidden", 0);
				frm.set_df_property("referring_practitioner", "read_only", 1);
			}
			frm.doc.requesting_department = $(this).attr("data-requesting-department")
			frm.set_df_property("template", "read_only", 1);
			frm.set_df_property("patient", "read_only", 1);
			frm.set_df_property("practitioner", "read_only", 1);
			frm.doc.invoiced = 0;
			if($(this).attr("data-invoiced") == 1){
				frm.doc.invoiced = 1;
			}
			refresh_field("invoiced");
			refresh_field("template");
			refresh_field("source");
			refresh_field("referring_practitioner");
			refresh_field("requesting_department");
			d.hide();
			return false;
		});
	});
	if(!result){
		var msg = "There are no Lab Test prescribed for "+frm.doc.patient;
		$(repl('<div class="col-xs-12" style="padding-top:20px;" >%(msg)s</div></div>', {msg: msg})).appendTo(html_field);
	}
	d.show();
};

cur_frm.cscript.custom_before_submit =  function(doc) {
	if(doc.normal_test_items){
		for(let result in doc.normal_test_items){
			if(!doc.normal_test_items[result].result_value	&&	doc.normal_test_items[result].require_result_value == 1 && !doc.normal_test_items[result].allow_blank == 1){
				frappe.msgprint(__("Please input all required Result Value(s)"));
				throw("Error");
			}
		}
	}
	if(doc.special_test_items){
		for(let result in doc.special_test_items){
			if(!doc.special_test_items[result].result_value	&&	doc.special_test_items[result].require_result_value == 1 && !doc.special_test_items[result].allow_blank == 1){
				frappe.msgprint(__("Please input all required Result Value(s)"));
				throw("Error");
			}
		}
	}
};

var make_dialog = function(frm, emailed, printed) {
	var number = frm.doc.mobile;

	var dialog = new frappe.ui.Dialog({
		title: 'Send SMS',
		width: 400,
		fields: [
			{fieldname:'sms_type', fieldtype:'Select', label:'Type', options:
			['Emailed','Printed']},
			{fieldname:'number', fieldtype:'Data', label:'Mobile Number', reqd:1},
			{fieldname:'messages_label', fieldtype:'HTML'},
			{fieldname:'messages', fieldtype:'HTML', reqd:1}
		],
		primary_action_label: __("Send"),
		primary_action : function(){
			var values = dialog.fields_dict;
			if(!values){
				return;
			}
			send_sms(values,frm);
			dialog.hide();
		}
	});
	if(frm.doc.report_preference == "Email"){
		dialog.set_values({
			'sms_type': "Emailed",
			'number': number
		});
		dialog.fields_dict.messages_label.html("Message".bold());
		dialog.fields_dict.messages.html(emailed);
	}else{
		dialog.set_values({
			'sms_type': "Printed",
			'number': number
		});
		dialog.fields_dict.messages_label.html("Message".bold());
		dialog.fields_dict.messages.html(printed);
	}
	var fd = dialog.fields_dict;
	$(fd.sms_type.input).change(function(){
		if(dialog.get_value('sms_type') == 'Emailed'){
			dialog.set_values({
				'number': number
			});
			fd.messages_label.html("Message".bold());
			fd.messages.html(emailed);
		}else{
			dialog.set_values({
				'number': number
			});
			fd.messages_label.html("Message".bold());
			fd.messages.html(printed);
		}
	});
	dialog.show();
};

var send_sms = function(v,frm){
	var doc = frm.doc;
	var number = v.number.last_value;
	var messages = v.messages.wrapper.innerText;
	frappe.call({
		method: "frappe.core.doctype.sms_settings.sms_settings.send_sms",
		args: {
			receiver_list: [number],
			msg: messages
		},
		callback: function(r) {
			if(r.exc) {frappe.msgprint(r.exc); return; }
			else{
				frappe.call({
					method: "erpnext.healthcare.doctype.lab_test.lab_test.update_lab_test_print_sms_email_status",
					args: {print_sms_email: "sms_sent", name: doc.name},
					callback: function(){
						cur_frm.reload_doc();
					}
				});
			}
		}
	});
};

var calculate_age = function(birth) {
	var	ageMS = Date.parse(Date()) - Date.parse(birth);
	var	age = new Date();
	age.setTime(ageMS);
	var	years =  age.getFullYear() - 1970;
	return  years + " Year(s) " + age.getMonth() + " Month(s) " + age.getDate() + " Day(s)";
};


var lab_test_html_tables = function(frm) {
	frm.fields_dict.lab_test_html.html("");
	var lab_test_table_html = `<table border="1px grey"  bordercolor="silver" style="width: 100%; height="100"">
	<th><b> </b></th>
	<th><b> Test Name	</b></th>
	<th><b> Event </b></th>
	<th><b> Result Value </b></th>
	<th><b> UOM </b></th>
	<th><b> Normal Range </b></th>
	<th><b> Comment </b></th>`;

	if (frm.doc.docstatus!=1){
		lab_test_table_html += `<th><b> Result Format </b></th>`;
	}

  frm.doc.normal_test_items.forEach(function(val, i){
		var i = i+1
		lab_test_table_html += `<tr style="text-align: center;"><td height="20">`
		lab_test_table_html += i
		lab_test_table_html += `<td style="width: 18%">` + (val.lab_test_name ? val.lab_test_name : '')+ "</td>"
		lab_test_table_html += `<td style="width: 18%">` + (val.lab_test_event ? val.lab_test_event : '') + "</td>"
		if (val.docstatus!=1) {
			if (val.type != "Select"){
				lab_test_table_html += `<td class="${val.name}" contenteditable = 'true' onclick="make_dirty()">` + (val.result_value ? val.result_value : '') + "</td>"
			}
			else {
				if(val.options && val.options.length > 0){
					var res = val.options.split("\n");
					if(res.length > 0){
						lab_test_table_html += `<td style="width: 18%"><select id="mySelect" class="dropdown_select ${val.name}" onchange="make_dirty()">`;
						lab_test_table_html += `<option value=""></option>`;
						res.forEach(function(option, j) {
							lab_test_table_html += `<option value="${option}" ${val.result_value==option ? 'selected' : ''}>${option}</option>`;
						});
						lab_test_table_html += `</select></td>`
					}
					else{
						lab_test_table_html += `<td style="width: 18%" class="${val.name}" contenteditable = 'true' onclick="make_dirty()">` + (val.result_value ? val.result_value : '') + "</td>";
					}
				}
				else{
					lab_test_table_html += `<td style="width: 18%" class="${val.name}" contenteditable = 'true' onclick="make_dirty()">` + (val.result_value ? val.result_value : '') + "</td>";
				}
			}
		}
		else{
			lab_test_table_html += `<td style="width: 18%" class="${val.name}" contenteditable = 'false'>` + (val.result_value ? val.result_value : '') + "</td>";
		}
		lab_test_table_html +=`<td style="width: 8%">` + (val.lab_test_uom ? val.lab_test_uom : '') + "</td>";
		if (val.docstatus!=1){
			lab_test_table_html += `<td style="width: 14% word-wrap: break-all" class="${val.name+'_normal'}"  contenteditable = 'true' onclick="make_dirty()">` + (val.normal_range? val.normal_range : '') + "</td>";
		}
		else {
			lab_test_table_html += `<td style="width: 14% word-wrap: break-all" class="${val.name+'_normal'}"  contenteditable = 'false'>` + (val.normal_range? val.normal_range : '') + "</td>";
		}
		if (val.docstatus!=1){
			lab_test_table_html += `<td style="width: 20% word-wrap: break-all" class="${val.name+'_comment'}"  contenteditable = 'true' onclick="make_dirty()">` + (val.lab_test_comment? val.lab_test_comment : '') + "</td>";
		}
		else {
			lab_test_table_html += `<td style="width: 20% word-wrap: break-all" class="${val.name+'_comment'}"  contenteditable = 'false'>` + (val.lab_test_comment? val.lab_test_comment : '') + "</td>";
		}
		if (val.docstatus!=1){
			lab_test_table_html += `<td align="center">
				<div><input type="checkbox" name="bold" id="${val.name+'_bold'}" onclick="make_dirty()" ${val.bold? 'checked' : ''}/><b>Bold</b></div>
				<div><input type="checkbox" name="italic" id="${val.name+'_italic'}" onclick="make_dirty()" ${val.italic? 'checked' : ''}/><i>Italic</i></div>
				<div><input type="checkbox" name="underline" id="${val.name+'_underline'}" onclick="make_dirty()" ${val.underline? 'checked' : ''}/><u>Underline</u></div>
			</td>`;
		}
		lab_test_table_html += `</tr>`;
	});
	lab_test_table_html +=	`</table>`;
	lab_test_table_html += `<script>
		function make_dirty() {
			cur_frm.dirty()
		}
	</script>`;
	frm.fields_dict.lab_test_html.html(lab_test_table_html);
}

var get_input_data = function(frm){
	if(frm.doc.normal_test_items && !frm.doc.__islocal){
		frm.doc.normal_test_items.forEach(function(val, i){
			var result = "";
			var comment = "";
			var normal_range = "";
			if(val.type == "Select" && val.options){
				result = $(frm.fields_dict["lab_test_html"].wrapper).find('.'+val.name).find(':selected').text();
			}
			else{
				result = $(frm.fields_dict["lab_test_html"].wrapper).find('.'+val.name)[0].innerText;
			}
			comment = $(frm.fields_dict["lab_test_html"].wrapper).find('.'+val.name+'_comment')[0].innerText;
			normal_range = $(frm.fields_dict["lab_test_html"].wrapper).find('.'+val.name+'_normal')[0].innerText;
			frappe.model.set_value(val.doctype, val.name, 'result_value', result);
			frappe.model.set_value(val.doctype, val.name, 'lab_test_comment', comment);
			frappe.model.set_value(val.doctype, val.name, 'normal_range', normal_range);
			if (val.docstatus!=1){
				frappe.model.set_value(val.doctype, val.name, 'bold', document.getElementById(val.name+'_bold').checked);
				frappe.model.set_value(val.doctype, val.name, 'italic', document.getElementById(val.name+'_italic').checked);
				frappe.model.set_value(val.doctype, val.name, 'underline', document.getElementById(val.name+'_underline').checked);
			}
		});
	}
	frm.refresh_fields();
}

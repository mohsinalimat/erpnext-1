// Copyright (c) 2016, ESS LLP and contributors
// For license information, please see license.txt
frappe.provide("erpnext.queries");
frappe.ui.form.on('Patient Appointment', {
	setup: function(frm) {
		frm.custom_make_buttons = {
			'Vital Signs': 'Vital Signs',
			'Patient Encounter': 'Patient Encounter'
		};
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
							frm.set_value("insurance", r.message.insurance)
							frm.set_df_property("insurance", "read_only", 1);
							frm.set_df_property("insurance_approval_number", "reqd", 1);
						}
					}
				}
			});
		}
	},
	insurance: function(frm){
		if(frm.doc.insurance && frm.doc.inpatient_record){
			frm.set_df_property("insurance_approval_number", "reqd", 1);
		}
	},
	refresh: function(frm) {
		frm.set_query("patient", function () {
			return {
				filters: {"disabled": 0}
			};
		});
		frm.set_query("practitioner", function() {
			return {
				filters: {
					'department': frm.doc.department
				}
			};
		});
		frm.set_query("service_unit", function(){
			return {
				filters: {
					"is_group": false,
					"allow_appointments": true,
					"modality_type": frm.doc.modality_type || ''
				}
			};
		});
		frm.set_query("companion", function() {
			return {
				filters: {
					'patient_companion': true
				}
			};
		});
		frm.set_query("insurance", function(){
			return{
				filters:{
					"patient": frm.doc.patient,
					"end_date":[">=", frm.doc.__islocal ? frappe.datetime.nowdate() : frm.doc.appointment_date],
					"docstatus":1
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
		if(frm.doc.patient){
			frm.add_custom_button(__('Patient History'), function() {
				frappe.route_options = {"patient": frm.doc.patient};
				frappe.set_route("patient_history");
			},__("View"));
		}
		if(!frm.doc.__islocal && (frm.doc.status == "In Progress" || frm.doc.status == "Closed")){
			frm.add_custom_button(__('Lab Order'), function() {
				frm.meta.default_print_format = "Appointment Lab Order";
				frm.print_doc();
			}, __("Print Order"));
			frm.add_custom_button(__('Procedure Order'), function() {
				frm.meta.default_print_format = "Appointment Procedure Order";
				frm.print_doc();
			}, __("Print Order"));
			frm.add_custom_button(__('Drug Prescription'), function() {
				frm.meta.default_print_format = "Appointment Drug Prescription";
				frm.print_doc();
			}, __("Print Order"));
			frm.add_custom_button(__('Encounter'), function() {
				frm.meta.default_print_format = "Appointment Encounter";
				frm.print_doc();
			}, __("Print Order"));
		}
		if(frm.doc.status == "Open"){
			frm.add_custom_button(__('Cancel'), function() {
				btn_update_status(frm, "Cancelled");
			});
			frm.add_custom_button(__('Reschedule'), function() {
				check_and_set_availability(frm);
			});
			if(frm.doc.procedure_template){
				frm.add_custom_button(__("Procedure"),function(){
					btn_create_procedure(frm);
				},"Create");
			}
			else if(frm.doc.radiology_procedure){
				frm.add_custom_button(__("Radiology Examination"),function(){
					btn_create_radiology_exam(frm);
				},"Create");
			}
			else{
				frm.add_custom_button(__("Patient Encounter"),function(){
					btn_create_encounter(frm);
				},"Create");
			}

			frm.add_custom_button(__('Vital Signs'), function() {
				btn_create_vital_signs(frm);
			},"Create");
		}
		if(frm.doc.status == "Scheduled" && !frm.doc.__islocal){
			frm.add_custom_button(__('Cancel'), function() {
				btn_update_status(frm, "Cancelled");
			});
			frm.add_custom_button(__('Reschedule'), function() {
				check_and_set_availability(frm);
			});
			if(frm.doc.procedure_template){
				frm.add_custom_button(__("Procedure"),function(){
					btn_create_procedure(frm);
				},"Create");
			}
			else if(frm.doc.radiology_procedure){
				frm.add_custom_button(__("Radiology Examination"),function(){
					btn_create_radiology_exam(frm);
				},"Create");
			}
			else{
				frm.add_custom_button(__("Patient Encounter"),function(){
					btn_create_encounter(frm);
				},"Create");
			}

			frm.add_custom_button(__('Vital Signs'), function() {
				btn_create_vital_signs(frm);
			},"Create");
		}
		if(frm.doc.status == "Pending"){
			frm.add_custom_button(__('Set Open'), function() {
				btn_update_status(frm, "Open");
			});
			frm.add_custom_button(__('Cancel'), function() {
				btn_update_status(frm, "Cancelled");
			});
		}
		if(frm.doc.invoiced){
			frm.set_df_property("insurance", "read_only", 1);
			frm.set_df_property("insurance_approval_number", "read_only", 1);
			frm.set_df_property("insurance_remarks", "read_only", 1);
		}
		frm.set_df_property("get_procedure_from_encounter", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("get_radiology_from_encounter", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("procedure_template", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("service_unit", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("radiology_procedure", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("mode_of_payment", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("paid_amount", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("apply_discount_on", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("discount_by", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("discount_value", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("source", "read_only", frm.doc.__islocal ? 0 : 1);
		frm.set_df_property("referring_practitioner", "read_only", frm.doc.__islocal ? 0 : 1);
		frappe.db.get_value('Healthcare Settings', {name: 'Healthcare Settings'}, 'manage_appointment_invoice_automatically', (r) => {
			if(r.manage_appointment_invoice_automatically == 1){
				frm.set_df_property("mode_of_payment", "hidden", 0);
				frm.set_df_property("paid_amount", "hidden", frm.doc.__islocal ? 0 : 1);
				frm.set_df_property("invoice_paid_amount", "hidden", 0);
				frm.set_df_property("outstanding_amount", "hidden", 0);
				frm.set_df_property("make_payment", "hidden", 0);
				frm.set_df_property("apply_discount_on", "hidden", 0);
				frm.set_df_property("discount_by", "hidden", 0);
				frm.set_df_property("discount_value", "hidden", 0);
				frm.set_df_property("mode_of_payment", "reqd", 1);
				frm.set_df_property("paid_amount", "reqd", 1);
				set_outstanding_amount(frm);
			}
			else{
				frm.set_df_property("mode_of_payment", "hidden", 1);
				frm.set_df_property("paid_amount", "hidden", 1);
				frm.set_df_property("invoice_paid_amount", "hidden", 1);
				frm.set_df_property("outstanding_amount", "hidden", 1);
				frm.set_df_property("make_payment", "hidden", 1);
				frm.set_df_property("apply_discount_on", "hidden", 1);
				frm.set_df_property("discount_by", "hidden", 1);
				frm.set_df_property("discount_value", "hidden", 1);
				frm.set_df_property("mode_of_payment", "reqd", 0);
				frm.set_df_property("paid_amount", "reqd", 0);
			}
		});
		if(!frm.doc.__islocal && frm.doc.status != "Cancelled" && (frappe.user.has_role("Accounts User") || frappe.model.can_write("Sales Invoice"))){
			if(frm.doc.invoiced != 1){
				frm.add_custom_button(__('Sales Invoice'), function(){
					btn_create_invoice(frm);
				},"Create");
			}
		}
		frappe.call({
			"method": "frappe.client.get_value",
			args: {
				doctype: "Healthcare Practitioner",
				filters: {
					'user_id': frappe.session.user
				},
				fieldname: ["name"]
			},
			callback: function (data) {
				if(data.message){
					frm.set_df_property("self_appointment", "hidden", 0);
				}
			}
		});
		if(frm.doc.patient){
			frm.set_df_property("patient_companion", "hidden", 0);
		}
	},
	check_availability: function(frm) {
		if(frm.doc.patient){
			if(frm.doc.radiology_procedure && !frm.doc.service_unit){
				frappe.msgprint({
					title: __('Missing Fields'),
					message: __("Service Unit is Mandatory"),
					indicator: 'red'
				});
			}
			else{
				check_and_set_availability(frm);
			}
		}
		else{
			frappe.msgprint({
				title: __('Missing Fields'),
				message: __("Patient is Mandatory"),
				indicator: 'red'
			});
		}
	},

	self_appointment: function(frm) {
		if(frm.doc.patient){
			if(frm.doc.radiology_procedure && !frm.doc.service_unit){
				frappe.msgprint({
					title: __('Missing Fields'),
					message: __("Service Unit is Mandatory"),
					indicator: 'red'
				});
			}
			else{
				frappe.call({
					"method": "frappe.client.get",
					args: {
						doctype: "Healthcare Practitioner",
						filters: {
							'user_id': frappe.session.user
						}
					},
					callback: function (data) {
						if(data.message){
							self_appointment(frm, data);
						}
					}
				});
			}
		}
		else{
			frappe.msgprint({
				title: __('Missing Fields'),
				message: __("Patient is Mandatory"),
				indicator: 'red'
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
	onload:function(frm){
		if(frm.is_new()) {
			frm.disable_save();
			frm.set_value("appointment_time", null);
			frappe.db.get_value("Healthcare Settings", "", "default_practitioner_source", function(r) {
				if(r && r.default_practitioner_source){
					frm.set_value("source", r.default_practitioner_source);
				}
				else{
					frm.set_value("source", "");
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
		}
	},
	get_procedure_from_encounter: function(frm) {
		get_procedure_prescribed(frm);
	},
	get_radiology_from_encounter: function(frm) {
		get_radiology_prescribed(frm);
	},
	radiology_procedure: function(frm) {
		if(frm.doc.radiology_procedure){
			frm.set_df_property("service_unit", "reqd", true);
		}
		else{
			frm.set_df_property("service_unit", "reqd", false);
			frm.set_value("modality_type", '');
		}
	},
	make_payment: function(frm) {
		if(frm.doc.outstanding_amount && frm.doc.outstanding_amount > 0 && frm.doc.sales_invoice_id){
			frappe.call({
				method: "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
				args: {
					"dt": "Sales Invoice",
					"dn": frm.doc.sales_invoice_id
				},
				callback: function(r) {
					var doclist = frappe.model.sync(r.message);
					frappe.set_route("Form", doclist[0].doctype, doclist[0].name);
				}
			});
		}
	},
	service_unit: function(frm) {
		if(frm.doc.service_unit){
			frappe.db.get_value("Healthcare Service Unit", frm.doc.service_unit, "company", function(r) {
				if(r && r.company){
					frm.set_value("company", r.company)
				}
			});
		}
	},
	companion_mobile: function(frm) {
		if(frm.doc.companion_mobile){
			frappe.call({
				method: "erpnext.healthcare.utils.get_contact_details",
				args: {
					'mobile_no': frm.doc.companion_mobile
				},
				callback: function(r) {
					if(r && r.message){
						frm.set_value("companion_name",r.message.first_name);
						frm.set_value("companion_email",r.message.email_id);
						frm.set_value("companion_id",r.message.companion_id);
						frm.set_value("companion_relation",r.message.companion_relation);
						frm.set_value("companion", r.message.name)
					}
				}
			});
			frm.set_df_property("companion_name","reqd", 1);
		}
		else{
			frm.set_df_property("companion_name","reqd", 0);
		}
	},

});

var set_outstanding_amount = function(frm) {
	if(frm.doc.invoiced == 1){
		frappe.call({
			method: "erpnext.healthcare.utils.get_sales_invoice_for_healthcare_doc",
			args:{
				doctype: "Patient Appointment",
				docname: frm.doc.name
			},
			callback: function(r) {
				if(r.message){
					frm.set_value("sales_invoice_id", r.message.name);
					if(r.message.outstanding_amount && r.message.outstanding_amount > 0){
						frm.set_value("invoice_paid_amount", r.message.paid_amount);
						frm.set_value("outstanding_amount", r.message.outstanding_amount);
					}
					else{
						frm.set_value("invoice_paid_amount", r.message.rounded_total);
						frm.set_value("outstanding_amount", 0);
					}
				}
				else{
					frm.set_value("outstanding_amount", 0);
					frm.set_value("sales_invoice_id", "");
				}
			}
		});
	}
}

var check_and_set_availability = function(frm) {
	var selected_slot = null;
	var service_unit = null;
	var duration = null;
	var practitioner_event = null;
	show_availability();

	function show_empty_state(practitioner, appointment_date) {
		frappe.msgprint({
			title: __('Not Available'),
			message: __("Healthcare Practitioner {0} not available on {1}", [practitioner.bold(), appointment_date.bold()]),
			indicator: 'red'
		});
	}

	function show_availability() {
		let selected_practitioner = '';
		let selected_appointment_date = '';
		let selected_appointment_type = '';
		var d = new frappe.ui.Dialog({
			title: __("Available slots"),
			fields: [
				{ fieldtype: 'Link', options: 'Medical Department', reqd:1, fieldname: 'department', label: 'Medical Department'},
				{ fieldtype: 'Link', options: 'Healthcare Practitioner', reqd:1, fieldname: 'practitioner', label: 'Healthcare Practitioner'},
				{ fieldtype: 'Column Break'},
				{ fieldtype: 'Link', options: 'Appointment Type', reqd:1, fieldname: 'appointment_type', label: 'Appointment Type',
				get_query:function () {
					return {
						query : "erpnext.healthcare.utils.get_practitioner_appointment_type",
						filters: {parent : d.get_value("practitioner")}
					}
				},
				},
				{ fieldtype: 'Int', fieldname: 'duration', label: 'Duration', read_only:1},
				{ fieldtype: 'Column Break'},
				{ fieldtype: 'Date', reqd:1, fieldname: 'appointment_date', label: 'Date'},
				{ fieldtype: 'Section Break'},
				{ fieldtype: 'HTML', fieldname: 'available_slots'}
			],
			primary_action_label: __("Book"),
			primary_action: function() {
				frm.set_value('appointment_time', selected_slot);
				frm.set_value('service_unit', service_unit || '');
				frm.set_value('practitioner_event', practitioner_event || '');
				// frm.set_value('duration', duration);
				frm.set_value('duration', d.get_value('duration'));
				frm.set_value('practitioner', d.get_value('practitioner'));
				frm.set_value('department', d.get_value('department'));
				frm.set_value('appointment_date', d.get_value('appointment_date'));
				frm.set_value('appointment_type', d.get_value('appointment_type'));
				var today = frappe.datetime.nowdate();
				if(frm.doc.appointment_date == today){
					frm.set_value("status", "Open");
				}
				else if (frm.doc.appointment_date > today){
					frm.set_value("status", "Scheduled");
				}
				else if (frm.doc.appointment_date < today){
					frm.set_value("status", "Pending");
				}
				d.hide();
				frm.enable_save();
				frm.save();
				frm.enable_save();

				d.get_primary_btn().attr('disabled', true);
			}
		});

		d.set_values({
			'department': frm.doc.department,
			'practitioner': frm.doc.practitioner,
			'appointment_date': frm.doc.appointment_date,
			'appointment_type': frm.doc.appointment_type
		});

		d.fields_dict["department"].df.onchange = () => {
			d.set_values({
				'practitioner': ''
			});
			var department = d.get_value('department');
			if(department){
				d.fields_dict.practitioner.get_query = function() {
					return {
						filters: {
							"department": department
						}
					};
				};
			}
		};

		// disable dialog action initially
		d.get_primary_btn().attr('disabled', true);

		// Field Change Handler

		var fd = d.fields_dict;
		d.fields_dict["appointment_type"].df.onchange = () => {
			frappe.db.get_value("Appointment Type", d.get_value('appointment_type'), 'default_duration', function(r) {
				if(r && r.default_duration){
					d.set_values({
						'duration': r.default_duration
					});
				}
			});
			if(d.get_value('appointment_type') && d.get_value('appointment_type') != selected_appointment_type){
				selected_appointment_type = d.get_value('appointment_type');
				show_slots(d, fd);
			}
		}
		d.fields_dict["appointment_date"].df.onchange = () => {
			if(d.get_value('appointment_date') && d.get_value('appointment_date') != selected_appointment_date){
				selected_appointment_date = d.get_value('appointment_date');
				var today = frappe.datetime.nowdate();
				if(today > selected_appointment_date){
					frappe.db.get_value("Healthcare Settings", "", "appointment_administrator", function(r) {
						if(r && r.appointment_administrator){
							if(frappe.user.has_role(r.appointment_administrator)){
								show_slots(d, fd);
							}
							else{
								frappe.msgprint(__("You cannot book appointments for past date"));
								fd.available_slots.html(__("You cannot book appointments for past date").bold());
							}
						}
						else{
							frappe.msgprint(__("You cannot book appointments for past date"));
							fd.available_slots.html(__("You cannot book appointments for past date").bold());
						}
					});
				}
				else
				{
					show_slots(d, fd);
				}
			}
			else if(!d.get_value("appointment_date")){
				selected_appointment_date = '';
			}
		}
		d.fields_dict["practitioner"].df.onchange = () => {
			if(d.get_value('practitioner') && d.get_value('practitioner') != selected_practitioner){
				selected_practitioner = d.get_value('practitioner');
				show_slots(d, fd);
			}
		};
		d.show();
		d.$wrapper.find('.modal-dialog').css("width", "800px");
	}

	function show_slots(d, fd) {
		// If appointment_type is there in frm then dialoge shoud needs that appointment_type - Rescehduling
		// If appointment_type is NOT there in frm then dialoge shoud NOT need appointment_type - Booking
		if (d.get_value('appointment_date') && d.get_value('practitioner') && !(frm.doc.appointment_type && !d.get_value("appointment_type"))){
			fd.available_slots.html("");
			exists_appointment(frm.doc.patient, d.get_value('practitioner'), d.get_value('appointment_date'), (exists)=>{
				if(exists){
					fd.available_slots.html("");
					frappe.call({
						method: 'erpnext.healthcare.doctype.patient_appointment.patient_appointment.get_availability_data',
						args: {
							practitioner: d.get_value('practitioner'),
							date: d.get_value('appointment_date')
						},
						callback: (r) => {
							var data = r.message;
							if(data.slot_details.length > 0 || data.present_events.length > 0) {
								var $wrapper = d.fields_dict.available_slots.$wrapper;

								// make buttons for each slot
								var slot_details = data.slot_details;
								var slot_html = "";
								var have_atleast_one_schedule = false;
								var have_atleast_one_schedule_for_service_unit = false;
								for (let i = 0; i < slot_details.length; i++) {
									if(slot_details[i].appointment_type == d.get_value("appointment_type") || slot_details[i].appointment_type == null){
										have_atleast_one_schedule = true;
										if((frm.doc.service_unit && frm.doc.service_unit == slot_details[i].service_unit) || (!frm.doc.service_unit)){
											have_atleast_one_schedule_for_service_unit = true;
											slot_html = slot_html + `<label>${slot_details[i].slot_name}</label>`;
											slot_html = slot_html + `<br/>` + slot_details[i].avail_slot.map(slot => {
												var appointment_count=0;
												let disabled = '';
												let capacity = slot_details[i].service_unit_capacity||'';
												let background_color = "#cef6d1";
												let start_str = slot.from_time;
												let slot_start_time = moment(slot.from_time, 'HH:mm:ss');
												let slot_to_time = moment(slot.to_time, 'HH:mm:ss');
												let interval = (slot_to_time - slot_start_time)/60000 | 0;
												//checking current time in solt
												var today = frappe.datetime.nowdate();
												if(today == d.get_value('appointment_date')){
													// disable before  current  time in current date
													var curr_time= moment(frappe.datetime.now_time(), 'HH:mm:ss');
													if(slot_start_time.isBefore(curr_time)){
														disabled = 'disabled="disabled"';
														background_color = "#A1A1A1";
													}
												}
												//iterate in all booked appointments, update the start time and duration
												slot_details[i].appointments.forEach(function(booked) {
													let booked_moment = moment(booked.appointment_time, 'HH:mm:ss');
													let end_time = booked_moment.clone().add(booked.duration, 'minutes');
													if(slot_details[i].fixed_duration != 1){
														if(end_time.isSame(slot_start_time) || end_time.isBetween(slot_start_time, slot_to_time)){
															start_str = end_time.format("HH:mm")+":00";
															interval = (slot_to_time - end_time)/60000 | 0;
															return false;
														}
													}
													// Check for overlaps considering appointment duration
													if(slot_details[i].allow_overlap != 1){
														if(slot_start_time.isBefore(end_time) && slot_to_time.isAfter(booked_moment)){
															// There is an overlap
															disabled = 'disabled="disabled"';
															background_color = "#d2d2ff";
															return false;
														}
													}
													else{
														if(slot_start_time.isBefore(end_time) && slot_to_time.isAfter(booked_moment)){
															appointment_count++
														}
														if(appointment_count>=slot_details[i].service_unit_capacity){
															// There is an overlap
															disabled = 'disabled="disabled"';
															background_color = "#d2d2ff";
															return false;
														}
													}
												});
												//iterate in all absent events and disable the slots
												slot_details[i].absent_events.forEach(function(event) {
													let event_from_time = moment(event.from_time, 'HH:mm:ss');
													let event_to_time = moment(event.to_time, 'HH:mm:ss');
													// Check for overlaps considering event start and end time
													if(slot_start_time.isBefore(event_to_time) && slot_to_time.isAfter(event_from_time)){
														// There is an overlap
														disabled = 'disabled="disabled"';
														background_color = "#ffd7d7";
														return false;
													}
												});
												let count=''
												if(slot_details[i].allow_overlap==1){
													count="("+appointment_count+"/"+capacity+")"
												}
												return `<button class="btn btn-default"
												data-name=${start_str}
												data-duration=${interval}
												data-service-unit="${slot_details[i].service_unit || ''}"
												data-event=""
												flag-fixed-duration=${slot_details[i].fixed_duration || 0}
												style="margin: 0 10px 10px 0; width: 92px; background-color:${background_color};" ${disabled}>
												${start_str.substring(0, start_str.length - 3)} ${count}
												</button>`;
											}).join("");
											slot_html = slot_html + `<br/>`;
										}
									}
								}

								if(!have_atleast_one_schedule && !data.present_events){
									slot_html = __("There are no schedules for appointment type {0}", [d.get_value("appointment_type")||'']).bold();
								}

								if(data.present_events && data.present_events.length > 0){
									slot_html = slot_html + `<br/>`;
									var present_events = data.present_events
									for (let i = 0; i < present_events.length; i++) {
										if((frm.doc.service_unit && frm.doc.service_unit == present_events[i].service_unit) || (!frm.doc.service_unit)){
											have_atleast_one_schedule_for_service_unit = true;
											slot_html = slot_html + `<label>${present_events[i].slot_name}</label>`;
											slot_html = slot_html + `<br/>` + present_events[i].avail_slot.map(slot => {
												var appointment_count=0;
												let disabled = '';
												let background_color = "#cef6d1";
												let start_str = slot.from_time;
												let capacity = present_events[i].service_unit_capacity
												let slot_start_time = moment(slot.from_time, 'HH:mm:ss');
												let slot_to_time = moment(slot.to_time, 'HH:mm:ss');
												let interval = (slot_to_time - slot_start_time)/60000 | 0;
												//checking current time in solt
												var today = frappe.datetime.nowdate();
												if(today == d.get_value('appointment_date')){
													// disable before  current  time in current date
													var curr_time= moment(frappe.datetime.now_time(), 'HH:mm:ss');
													if(slot_start_time.isBefore(curr_time)){
														disabled = 'disabled="disabled"';
														background_color = "#A1A1A1";
													}
												}
												//iterate in all booked appointments, update the start time and duration
												present_events[i].appointments.forEach(function(booked) {
													let booked_moment = moment(booked.appointment_time, 'HH:mm:ss');
													let end_time = booked_moment.clone().add(booked.duration, 'minutes');
													// Check for overlaps considering appointment duration
													if(present_events[i].allow_overlap != 1){
														if(slot_start_time.isBefore(end_time) && slot_to_time.isAfter(booked_moment)){
															// There is an overlap
															disabled = 'disabled="disabled"';
															background_color = "#d2d2ff";
															return false;
														}
													}
													else{
														if(slot_start_time.isBefore(end_time) && slot_to_time.isAfter(booked_moment)){
															appointment_count++
														}
														if(appointment_count>=present_events[i].service_unit_capacity){
															// There is an overlap
															disabled = 'disabled="disabled"';
															background_color = "#d2d2ff";
															return false;
														}
													}
												});
												//iterate in all absent events and disable the slots
												present_events[i].absent_events.forEach(function(event) {
													let event_from_time = moment(event.from_time, 'HH:mm:ss');
													let event_to_time = moment(event.to_time, 'HH:mm:ss');
													// Check for overlaps considering event start and end time
													if(slot_start_time.isBefore(event_to_time) && slot_to_time.isAfter(event_from_time)){
														// There is an overlap
														disabled = 'disabled="disabled"';
														background_color = "#ffd7d7";
														return false;
													}
												});
												let count=''
												if(present_events[i].allow_overlap==1){
													count="("+appointment_count+"/"+capacity+")"
												}
												return `<button class="btn btn-default"
													data-name=${start_str}
													data-duration=${interval}
													data-service-unit="${present_events[i].service_unit || ''}"
													data-event="${present_events[i].event||''}"
													flag-fixed-duration=${1}
													style="margin: 0 10px 10px 0; width: 92px; background-color:${background_color};" ${disabled}>
													${start_str.substring(0, start_str.length - 3)} ${count}
												</button>`;
											}).join("");
											slot_html = slot_html + `<br/>`;
										}
									}
								}

								if(frm.doc.service_unit && (have_atleast_one_schedule || data.present_events) && !have_atleast_one_schedule_for_service_unit){
									slot_html = __("There are no schedules for service unit {0}", [frm.doc.service_unit||'']).bold();
									}

								$wrapper
									.css('margin-bottom', 0)
									.addClass('text-center')
									.html(slot_html);

								// blue button when clicked
								$wrapper.on('click', 'button', function() {
									var $btn = $(this);
									$wrapper.find('button').removeClass('btn-primary');
									$btn.addClass('btn-primary');
									selected_slot = $btn.attr('data-name');
									service_unit = $btn.attr('data-service-unit')
									duration = $btn.attr('data-duration')
									practitioner_event = $btn.attr('data-event')
									// enable dialog action
									d.get_primary_btn().attr('disabled', null);
									if($btn.attr('flag-fixed-duration') == 1){
										d.set_values({
											'duration': $btn.attr('data-duration')
										});
									}
								});

							}else {
								//	fd.available_slots.html("Please select a valid date.".bold())
								show_empty_state(d.get_value('practitioner'), d.get_value('appointment_date'));
							}
						},
						freeze: true,
						freeze_message: __("Fetching records......")
					});
				}
				else{
					fd.available_slots.html("");
				}
			});
		}
		else{
			fd.available_slots.html("Appointment date and Healthcare Practitioner are Mandatory".bold());
		}
	}

	function exists_appointment(patient, practitioner, appointment_date, callback) {
		frappe.call({
			method: "erpnext.healthcare.utils.exists_appointment",
			args:{
				appointment_date: appointment_date,
				practitioner: practitioner,
				patient: patient
			},
			callback: function(data) {
				if(data.message){
					var message  = __("Appointment is already booked on {0} for {1} with {2}, Do you want to book another appointment on this day?",
						[appointment_date.bold(), patient.bold(), practitioner.bold()]);
					frappe.confirm(
						message,
						function(){
							callback(true);
						},
						function(){
							frappe.show_alert({
								message:__("Select new date and slot to book appointment if you wish."),
								indicator:'yellow'
							});
							callback(false);
						}
					);
				}
				else{
					callback(true);
				}
			}
		});
	}
}

var get_procedure_prescribed = function(frm){
	if(frm.doc.patient){
		frappe.call({
			method:"erpnext.healthcare.doctype.patient_appointment.patient_appointment.get_procedure_prescribed",
			args: {patient: frm.doc.patient},
			callback: function(r){
				show_procedure_templates(frm, r.message);
			}
		});
	}
	else{
		frappe.msgprint(__("Please select Patient to get prescribed procedure"));
	}
};

var show_procedure_templates = function(frm, result){
	var d = new frappe.ui.Dialog({
		title: __("Prescribed Procedures"),
		fields: [
			{
				fieldtype: "HTML", fieldname: "procedure_template"
			}
		]
	});
	var html_field = d.fields_dict.procedure_template.$wrapper;
	html_field.empty();
	$.each(result, function(x, y){
		var row = $(repl('<div class="col-xs-12" style="padding-top:12px; text-align:center;" >\
		<div class="col-xs-5"> %(encounter)s <br> %(consulting_practitioner)s <br> %(encounter_date)s </div>\
		<div class="col-xs-5"> %(procedure_template)s <br>%(practitioner)s  <br> %(date)s</div>\
		<div class="col-xs-2">\
		<a data-name="%(name)s" data-procedure-template="%(procedure_template)s"\
		data-encounter="%(encounter)s" data-practitioner="%(practitioner)s"\
		data-date="%(date)s"  data-department="%(department)s">\
		<button class="btn btn-default btn-xs">Add\
		</button></a></div></div><div class="col-xs-12"><hr/><div/>', {name:y[0], procedure_template: y[1],
				encounter:y[2], consulting_practitioner:y[3], encounter_date:y[4],
				practitioner:y[5]? y[5]:'', date: y[6]? y[6]:'', department: y[7]? y[7]:''})).appendTo(html_field);
		row.find("a").click(function() {
			frm.doc.procedure_template = $(this).attr("data-procedure-template");
			frm.doc.procedure_prescription = $(this).attr("data-name");
			frm.doc.practitioner = $(this).attr("data-practitioner");
			frm.doc.appointment_date = $(this).attr("data-date");
			frm.doc.department = $(this).attr("data-department");
			refresh_field("procedure_template");
			refresh_field("procedure_prescription");
			refresh_field("appointment_date");
			refresh_field("practitioner");
			refresh_field("department");
			d.hide();
			return false;
		});
	});
	if(!result || result.length < 1){
		var msg = "There are no procedure prescribed for patient "+frm.doc.patient;
		$(repl('<div class="text-left">%(msg)s</div>', {msg: msg})).appendTo(html_field);
	}
	d.show();
};

var btn_create_procedure = function(frm){
	var doc = frm.doc;
	frappe.call({
		method:"erpnext.healthcare.doctype.clinical_procedure.clinical_procedure.create_procedure",
		args: {appointment: doc.name},
		callback: function(data){
			if(!data.exc){
				var doclist = frappe.model.sync(data.message);
				frappe.set_route("Form", doclist[0].doctype, doclist[0].name);
			}
		}
	});
};

var btn_create_radiology_exam = function(frm){
	var doc = frm.doc;
	frappe.call({
		method:"erpnext.healthcare.doctype.radiology_examination.radiology_examination.create_radiology_examination",
		args: {appointment: doc.name},
		callback: function(data){
			if(!data.exc){
				var doclist = frappe.model.sync(data.message);
				frappe.set_route("Form", doclist[0].doctype, doclist[0].name);
			}
		}
	});
};

var btn_create_encounter = function(frm){
	var doc = frm.doc;
	frappe.call({
		method:"erpnext.healthcare.doctype.patient_appointment.patient_appointment.create_encounter",
		args: {appointment: doc.name},
		callback: function(data){
			if(!data.exc){
				var doclist = frappe.model.sync(data.message);
				frappe.set_route("Form", doclist[0].doctype, doclist[0].name);
			}
		}
	});
};

var btn_create_vital_signs = function (frm) {
	if(!frm.doc.patient){
		frappe.throw(__("Please select patient"));
	}
	frappe.route_options = {
		"patient": frm.doc.patient,
		"appointment": frm.doc.name,
	};
	frappe.new_doc("Vital Signs");
};

var btn_update_status = function(frm, status){
	var doc = frm.doc;
	if(status == "Cancelled"){
		cancellation_reasons(frm);
	}
	else{
		var msg = __('Are you sure you want to '+status+' this appointment?');
		frappe.confirm(msg,
			function() {
					update_status(frm, status);
			}
		);
	}
};

var update_status = function(frm, status){
	frappe.call({
		method:
		"erpnext.healthcare.doctype.patient_appointment.patient_appointment.update_status",
		args: {appointment_id: frm.doc.name, status:status},
		callback: function(data){
			if(!data.exc){
				frm.reload_doc();
			}
		}
	});
}

frappe.ui.form.on("Patient Appointment", "practitioner", function(frm) {
	if(frm.doc.practitioner){
		frappe.call({
			"method": "frappe.client.get",
			args: {
				doctype: "Healthcare Practitioner",
				name: frm.doc.practitioner
			},
			callback: function (data) {
				frappe.model.set_value(frm.doctype,frm.docname, "department",data.message.department);
				if(!frm.doc.paid_amount && frm.doc.paid_amount != 0){
					var paid_amount = 0;
					if(frm.doc.inpatient_record){
						paid_amount = data.message.ip_consulting_charge;
					}
					else{
						paid_amount = data.message.op_consulting_charge;
					}
					if(frm.doc.paid_amount > paid_amount){
						frm.set_value("paid_amount", paid_amount)
						frappe.model.set_value(frm.doctype,frm.docname, "paid_amount", paid_amount);
					}
				}
			}
		});
	}
});

frappe.ui.form.on("Patient Appointment", "patient", function(frm) {
	if(frm.doc.patient){
		frappe.call({
			"method": "frappe.client.get",
			args: {
				doctype: "Patient",
				name: frm.doc.patient
			},
			callback: function (data) {
				var age = null;
				if(data.message.dob){
					age = calculate_age(data.message.dob);
				}
				frappe.model.set_value(frm.doctype,frm.docname, "patient_age", age);
			}
		});
	}
});

var calculate_age = function(birth) {
	var ageMS = Date.parse(Date()) - Date.parse(birth);
	var age = new Date();
	age.setTime(ageMS);
	var years =  age.getFullYear() - 1970;
	return  years + " Year(s) " + age.getMonth() + " Month(s) " + age.getDate() + " Day(s)";
};

var get_radiology_prescribed = function(frm){
	if(frm.doc.patient){
		frappe.call({
			method:"erpnext.healthcare.doctype.radiology_examination.radiology_examination.get_radiology_procedure_prescribed",
			args: {patient: frm.doc.patient},
			callback: function(r){
				show_radiology_procedure(frm, r.message);
			}
		});
	}
	else{
		frappe.msgprint("Please select Patient to get prescribed procedure");
	}
};

var show_radiology_procedure = function(frm, result){
	var d = new frappe.ui.Dialog({
		title: __("Radiology Procedure Prescriptions"),
		fields: [
			{
				fieldtype: "HTML", fieldname: "radiology_prescribed"
			}
		]
	});
	var html_field = d.fields_dict.radiology_prescribed.$wrapper;
	html_field.empty();
	$.each(result, function(x, y){
		var row = $(repl('<div class="col-xs-12" style="padding-top:12px; text-align:center;" >\
		<div class="col-xs-2"> %(radiology_procedure)s </div>\
		<div class="col-xs-2"> %(encounter)s </div>\
		<div class="col-xs-3"> %(date)s </div>\
		<div class="col-xs-1">\
		<a data-name="%(name)s" data-radiology-procedure="%(radiology_procedure)s"\
		data-encounter="%(encounter)s"\
		data-invoiced="%(invoiced)s" data-source="%(source)s"\
		data-referring-practitioner="%(referring_practitioner)s" data-comments="%(comments)s" href="#">\
		<button class="btn btn-default btn-xs">Get Radiology\
		</button></a></div></div>', {name:y[0], radiology_procedure: y[1], encounter:y[2], invoiced:y[3],  date:y[4],
		source:y[5], referring_practitioner:y[6], comments:y[9]})).appendTo(html_field);
		row.find("a").click(function() {
			frm.doc.radiology_procedure = $(this).attr("data-radiology-procedure");
			frm.doc.radiology_procedure_prescription = $(this).attr("data-name");
			// frm.set_df_property("radiology_procedure", "read_only", 1);
			frm.set_df_property("patient", "read_only", 1);
			frm.doc.invoiced = 0;
			if($(this).attr("data-invoiced") == 1){
				frm.doc.invoiced = 1;
			}
			if($(this).attr("data-comments")){
				frm.set_value("notes", $(this).attr("data-comments"));
			}
			frm.doc.source =  $(this).attr("data-source");
			frm.doc.referring_practitioner= $(this).attr("data-referring-practitioner")
			if(frm.doc.referring_practitioner){
				frm.set_df_property("referring_practitioner", "hidden", 0);
			}
			frappe.db.get_value("Radiology Procedure", frm.doc.radiology_procedure, "modality_type", function(r) {
				if(r && r.modality_type){
					frm.set_value("modality_type", r.modality_type);
				}
				else{
					frm.set_value("modality_type", '');
				}
			});
			refresh_field("radiology_procedure_prescription");
			refresh_field("source");
			refresh_field("referring_practitioner");
			refresh_field("invoiced");
			refresh_field("radiology_procedure");
			d.hide();
			return false;
		});
	});
	if(!result){
		var msg = "There are no Radiology prescribed for "+frm.doc.patient;
		$(repl('<div class="col-xs-12" style="padding-top:20px;" >%(msg)s</div></div>', {msg: msg})).appendTo(html_field);
	}
	d.show();
};

var btn_create_invoice = function(frm){
	var doc = frm.doc
	frappe.call({
		method: 'erpnext.healthcare.doctype.patient_appointment.patient_appointment.invoice_from_appointment',
		args:{
			appointment_id: doc.name
		},
		callback: function(r){
			if(!r.exc){
				frm.reload_doc();
				var doclist = frappe.model.sync(r.message);
				frappe.set_route("Form", doclist[0].doctype, doclist[0].name);
			}
		},
		freeze: true,
		freeze_message: __("Creating invoice......")
	});
}

var self_appointment = function (frm, data) {
	var selected_slot = null;
	var service_unit = null;
	var duration = null;
	show_availability();

	function show_empty_state(practitioner, appointment_date) {
		frappe.msgprint({
			title: __('Not Available'),
			message: __("Healthcare Practitioner {0} not available on {1}", [practitioner.bold(), appointment_date.bold()]),
			indicator: 'red'
		});
	}

	function show_availability() {
		let selected_practitioner = '';
		let selected_appointment_date = '';
		var d = new frappe.ui.Dialog({
			title: __("Available slots"),
			fields: [
				{ fieldtype: 'Link', options: 'Medical Department', read_only:1, fieldname: 'department', label: 'Medical Department'},
				{ fieldtype: 'Link', options: 'Healthcare Practitioner', read_only:1, fieldname: 'practitioner', label: 'Healthcare Practitioner'},
				{ fieldtype: 'Column Break'},
				{ fieldtype: 'Link', options: 'Appointment Type', reqd:1, fieldname: 'appointment_type', label: 'Appointment Type'},
				{ fieldtype: 'Int', fieldname: 'duration', reqd:1, label: 'Duration'},
				{ fieldtype: 'Column Break'},
				{ fieldtype: 'Date', reqd:1, fieldname: 'appointment_date', label: 'Date'},
				{ fieldtype: 'Time', reqd:1, fieldname: 'appointment_time', label: 'Time'}
			],
			primary_action_label: __("Book"),
			primary_action: function() {
				frm.set_value('appointment_time', d.get_value('appointment_time'));
				frm.set_value('service_unit', frm.doc.service_unit);
				frm.set_value('duration', d.get_value('duration'));
				frm.set_value('practitioner', d.get_value('practitioner'));
				frm.set_value('department', d.get_value('department'));
				frm.set_value('appointment_date', d.get_value('appointment_date'));
				frm.set_value('appointment_type', d.get_value('appointment_type'))
				d.hide();
				frm.enable_save();
				frm.save();
				frm.enable_save();
				d.get_primary_btn().attr('disabled', true);
			}
		});

		d.set_values({
			'department': data.message.department,
			'practitioner': data.message.name,
			'appointment_date': frm.doc.appointment_date,
			'appointment_type': frm.doc.appointment_type
		});

		// Field Change Handler
		var fd = d.fields_dict;
		d.fields_dict["appointment_type"].df.onchange = () => {
			frappe.db.get_value("Appointment Type", d.get_value('appointment_type'), 'default_duration', function(r) {
				if(r && r.default_duration){
					d.set_values({
						'duration': r.default_duration
					});
				}
			});
		}
		d.fields_dict["appointment_date"].df.onchange = () => {
			if(d.get_value('appointment_date') && d.get_value('appointment_date') != selected_appointment_date){
				selected_appointment_date = d.get_value('appointment_date');
				var today = frappe.datetime.nowdate();
				if(today > selected_appointment_date){
					frappe.msgprint(__("you cannot book appointments for past date"));
					d.set_values({
						"appointment_date": ""
					});
				}
			}
			else if(!d.get_value("appointment_date")){
				selected_appointment_date = '';
			}
		}
		d.show();
		d.$wrapper.find('.modal-dialog').css("width", "800px");
	}
}
//cancellation
var cancellation_reasons = function(frm) {
	var d_reasons = new frappe.ui.Dialog({
		title: __("Cancellation Reasons"),
		fields: [
			{ fieldtype: 'Select', options: '\nPatient\nPractitioner\nFacility', reqd:1, fieldname: 'cancellation_source', label: 'Cancellation Source'},
			{ fieldtype: 'Link', options: 'Appointment Cancellation Reason', reqd:1, fieldname: 'cancellation_reason', label: 'Cancellation Reason',
				get_query:function () {
					return {
						filters: {
							"cancellation_source": d_reasons.get_value('cancellation_source')
						}
					};
				}
			},
			{ fieldtype: 'Column Break'},
			{ fieldtype: 'Select', options: frappe.meta.get_docfield("Patient Appointment", "cancelled_by" ).options, fieldname: 'cancelled_by', label: 'Cancelled By'},
			{ fieldtype: 'Small Text', fieldname: 'cancellation_notes', label: 'Cancellation Notes'},
		],
		primary_action_label: __("Cancel"),
		primary_action: function() {
			frm.set_value('cancellation_source', d_reasons.get_value('cancellation_source'));
			frm.set_value('cancellation_reason', d_reasons.get_value('cancellation_reason'));
			frm.set_value('cancelled_by', d_reasons.get_value('cancelled_by'));
			frm.set_value('cancellation_notes', d_reasons.get_value('cancellation_notes'));
			d_reasons.hide();
			frm.enable_save();
			d_reasons.get_primary_btn().attr('disabled', true);
			update_status(frm, "Cancelled")
		}
	});
	// disable dialog action initially
	d_reasons.get_primary_btn().attr('disabled', true);
	d_reasons.show();
	d_reasons.$wrapper.find('.modal-dialog').css("width", "800px");

	d_reasons.fields_dict["cancellation_reason"].df.onchange = () => {
		d_reasons.get_primary_btn().attr('disabled', null);
	}
}

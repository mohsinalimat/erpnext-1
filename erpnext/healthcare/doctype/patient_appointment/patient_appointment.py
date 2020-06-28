# -*- coding: utf-8 -*-
# Copyright (c) 2015, ESS LLP and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
import json
from frappe.utils import getdate, add_days, get_time, time_diff_in_seconds
from frappe import _
import datetime
from frappe.core.doctype.sms_settings.sms_settings import send_sms
from erpnext.hr.doctype.employee.employee import is_holiday
from erpnext.accounts.doctype.sales_invoice.sales_invoice import set_revenue_sharing_distribution
from erpnext.healthcare.doctype.healthcare_settings.healthcare_settings import get_receivable_account,get_income_account
from erpnext.healthcare.utils import validity_exists, service_item_and_practitioner_charge, sales_item_details_for_healthcare_doc, get_insurance_details, create_companion_contact, create_insurance_approval_doc
import datetime

class PatientAppointment(Document):
	def on_update(self):
		if self.status in ["Open", "Scheduled", "Pending"]:
			update_status(self.name, self.status)
		if self.companion_mobile and self.companion_name:
			companion_details = {
				'first_name': self.companion_name,
				'companion_id': self.companion_id,
				'companion_relation': self.companion_relation
			}
			companion = create_companion_contact(self.patient, companion_details, self.companion_mobile, self.companion_email)
			if companion:
				frappe.db.set_value("Patient Appointment", self.name, "companion", companion.name)
		self.reload()
	def validate(self):
		# if not self.is_new():
		# 	old_doc = self.get_doc_before_save()
		# 	if str(old_doc.appointment_date) != self.appointment_date or str(old_doc.appointment_time) != self.appointment_time:
		# 		verify_repetition(self)

		end_time = datetime.datetime.combine(getdate(self.appointment_date), get_time(self.appointment_time)) + datetime.timedelta(minutes=float(self.duration))
		query = """
			select
				name, practitioner, patient, appointment_time, duration
			from
				`tabPatient Appointment`
			where
				appointment_date=%(appointment_date)s and name!=%(name)s and status NOT IN ("Closed", "Cancelled")
				and (practitioner=%(practitioner)s or patient=%(patient)s) and
				((appointment_time<%(appointment_time)s and appointment_time + INTERVAL duration MINUTE>%(appointment_time)s) or
				(appointment_time>%(appointment_time)s and appointment_time<%(end_time)s) or
				(appointment_time=%(appointment_time)s))
		"""
		# service unit overlap
		if self.service_unit:
			query +=""" and service_unit=%(service_unit)s"""
			overlaps = frappe.db.sql(query.format(),{"appointment_date":self.appointment_date, "name":self.name, "practitioner":self.practitioner, "patient":self.patient,
						"appointment_time":self.appointment_time,  "end_time":end_time.time(), "service_unit":self.service_unit})
			allow_overlap=frappe.get_value('Healthcare Service Unit', self.service_unit, 'overlap_appointments')
			if allow_overlap:
				if self.practitioner_event:
					service_unit_capacity= frappe.get_value('Practitioner Event', self.practitioner_event, 'total_service_unit_capacity')
				else:
					service_unit_capacity= frappe.get_value('Healthcare Service Unit', self.service_unit, 'total_service_unit_capacity')
				if service_unit_capacity and  len(overlaps)>=int(service_unit_capacity):
					frappe.throw(_(""" Not Allowed, Maximum capacity reached Service unit {0}""").format(self.service_unit))
				else:
					overlaps = False
		else:
			overlaps  = frappe.db.sql(query.format(),{"appointment_date":self.appointment_date, "name":self.name, "practitioner":self.practitioner, "patient":self.patient,
						"appointment_time":self.appointment_time,  "end_time":end_time.time()})
		if overlaps:
			frappe.throw(_("""Appointment overlaps with {0}.<br> {1} has appointment scheduled
			with {2} at {3} having {4} minute(s) duration.""").format(overlaps[0][0], overlaps[0][1], overlaps[0][2], overlaps[0][3], overlaps[0][4]))

		if self.service_unit:
			service_unit_company = frappe.db.get_value("Healthcare Service Unit", self.service_unit, "company")
			if service_unit_company and service_unit_company != self.company:
				self.company = service_unit_company
		appointment_action(self, "SMS")

	def after_insert(self):
		today = datetime.date.today()
		appointment_date = getdate(self.appointment_date)
		# If appointment created for today set as open
		status = "Open"
		if today == appointment_date:
			status = "Open"
		elif today < appointment_date:
			status = "Scheduled"
		elif today > appointment_date:
			status = "Pending"
		self.status = status
		if self.procedure_prescription:
			frappe.db.set_value("Procedure Prescription", self.procedure_prescription, "appointment_booked", True)
			if self.procedure_template:
				comments = frappe.db.get_value("Procedure Prescription", self.procedure_prescription, "comments")
				if comments:
					frappe.db.set_value("Patient Appointment", self.name, "notes", comments)
		elif self.inpatient_record_procedure:
			frappe.db.set_value("Inpatient Record Procedure", self.inpatient_record_procedure, "appointment_booked", True)
		elif self.radiology_procedure_prescription:
			frappe.db.set_value("Radiology Procedure Prescription", self.radiology_procedure_prescription, "appointment_booked", True)
		if not self.procedure_template and not self.radiology_procedure:
			from erpnext.healthcare.utils import get_practitioner_charge
			is_ip = True if self.inpatient_record else False
			practitioner_charge = get_practitioner_charge(self.practitioner, is_ip, self.practitioner_event, self.appointment_type)
			# Check fee validity exists
			appointment = self
			validity_exist = validity_exists(appointment.practitioner, appointment.patient)
			if validity_exist and practitioner_charge:
				fee_validity = frappe.get_doc("Fee Validity", validity_exist[0][0])

				# Check if the validity is valid
				appointment_date = getdate(appointment.appointment_date)
				if (fee_validity.valid_till >= appointment_date) and (fee_validity.visited < fee_validity.max_visit):
					visited = fee_validity.visited + 1
					frappe.db.set_value("Fee Validity", fee_validity.name, "visited", visited)
					if fee_validity.ref_invoice:
						frappe.db.set_value("Patient Appointment", appointment.name, "invoiced", True)
					frappe.msgprint(_("{0} has fee validity till {1}").format(appointment.patient, fee_validity.valid_till))
			elif not practitioner_charge:
				frappe.db.set_value("Patient Appointment", appointment.name, "invoiced", True)

			if frappe.db.get_value("Healthcare Settings", None, "manage_appointment_invoice_automatically") == '1' and \
				frappe.db.get_value("Patient Appointment", self.name, "invoiced") != 1:
				sales_invoice = invoice_appointment(self, True)
				sales_invoice.submit()
				frappe.msgprint(_("Sales Invoice {0} created".format(sales_invoice.name)), alert=True)

			elif self.inpatient_record and frappe.db.get_value("Healthcare Settings", None, "auto_invoice_inpatient") == '1':
				invoice_appointment(self, False)
		#Alert
		confirm_sms(self)
		if self.insurance:
			if self.procedure_template or self.radiology_procedure:
				is_insurance_approval = frappe.get_value("Insurance Company", (frappe.get_value("Insurance Assignment", self.insurance, "insurance_company")), "is_insurance_approval")
				if is_insurance_approval:
					create_insurance_approval_doc(self)

	def before_insert(self):
		verify_repetition(self)


@frappe.whitelist()
def invoice_appointment(appointment_doc, is_pos):
	if not appointment_doc.name:
		return False
	sales_invoice = set_invoice_details_for_appointment(appointment_doc, is_pos)
	sales_invoice.save(ignore_permissions=True)
	return sales_invoice

def set_invoice_details_for_appointment(appointment_doc, is_pos):
	sales_invoice = frappe.new_doc("Sales Invoice")
	sales_invoice.patient = appointment_doc.patient
	sales_invoice.patient_name = appointment_doc.patient_name
	sales_invoice.customer = frappe.get_value("Patient", appointment_doc.patient, "customer")
	sales_invoice.appointment = appointment_doc.name
	sales_invoice.ref_practitioner = appointment_doc.referring_practitioner
	sales_invoice.due_date = getdate()
	sales_invoice.inpatient_record = appointment_doc.inpatient_record
	sales_invoice.is_pos = is_pos
	from erpnext.stock.get_item_details import get_pos_profile
	if is_pos:
		pos_profile = get_pos_profile(appointment_doc.company)
		if pos_profile:
			sales_invoice.pos_profile = pos_profile.name
		else:
			frappe.throw(_("Setup POS Profile for the Company, {0}".format(appointment_doc.company)))
	sales_invoice.company = appointment_doc.company
	sales_invoice.debit_to = get_receivable_account(appointment_doc.company, appointment_doc.patient)
	if appointment_doc.discount_value and appointment_doc.discount_value > 0:
		sales_invoice.apply_discount_on = appointment_doc.apply_discount_on
		if appointment_doc.discount_by == "Fixed Amount":
			sales_invoice.discount_amount = appointment_doc.discount_value
		elif appointment_doc.discount_by == "Percentage":
			sales_invoice.additional_discount_percentage = appointment_doc.discount_value
	cost_center = False
	if appointment_doc.service_unit:
		cost_center = frappe.db.get_value("Healthcare Service Unit", appointment_doc.service_unit, "cost_center")
	item_line = sales_invoice.append("items")
	item_code = False

	if appointment_doc.procedure_template:
		item_code = frappe.db.get_value("Clinical Procedure Template", appointment_doc.procedure_template, "item")
	elif appointment_doc.radiology_procedure:
		item_code = frappe.db.get_value("Radiology Procedure", appointment_doc.radiology_procedure, "item")
	practitioner_charge = 0
	if item_code:
		item_line.item_code = item_code
		item_details = sales_item_details_for_healthcare_doc(item_line.item_code, appointment_doc)
		item_line.item_name = item_details.item_name
		item_line.description = frappe.db.get_value("Item", item_line.item_code, "description")
		item_line.rate = item_details.price_list_rate
	else:
		service_item, practitioner_charge = service_item_and_practitioner_charge(appointment_doc)
		item_line.item_code = service_item
		item_line.description = "Consulting Charges:  " + appointment_doc.practitioner
		item_line.income_account = get_income_account(appointment_doc.practitioner, appointment_doc.company)
		item_line.rate = practitioner_charge

	if appointment_doc.insurance and item_line.item_code:
		patient_doc= frappe.get_doc("Patient", appointment_doc.patient)
		insurance_details = get_insurance_details(appointment_doc.insurance, item_line.item_code, patient_doc, appointment_doc.appointment_date)
		if insurance_details:
			item_line.discount_percentage = insurance_details.discount
			if insurance_details.rate and insurance_details.rate > 0:
				item_line.rate = insurance_details.rate
			if item_line.discount_percentage and float(item_line.discount_percentage) > 0:
				item_line.discount_amount = float(item_line.rate) * float(item_line.discount_percentage) * 0.01
				if item_line.discount_amount and item_line.discount_amount > 0:
					item_line.rate = float(item_line.rate) - float(item_line.discount_amount)
			item_line.insurance_claim_coverage = insurance_details.coverage
			item_line.insurance_approval_number=  appointment_doc.insurance_approval_number if appointment_doc.insurance_approval_number else ''

	item_line.reference_dt = "Patient Appointment"
	item_line.reference_dn = appointment_doc.name
	item_line.cost_center = cost_center if cost_center else ''
	item_line.qty = 1
	item_line.rate  = float(item_line.rate)
	item_line  = set_revenue_sharing_distribution(sales_invoice,item_line)
	item_line.amount = item_line.rate*item_line.qty
	if appointment_doc.insurance and item_line.insurance_claim_coverage and float(item_line.insurance_claim_coverage) > 0:
		item_line.insurance_claim_amount = item_line.amount*0.01*float(item_line.insurance_claim_coverage)
		sales_invoice.total_insurance_claim_amount = item_line.insurance_claim_amount

	if appointment_doc.mode_of_payment or appointment_doc.paid_amount:
		payments_line = sales_invoice.append("payments")
		payments_line.mode_of_payment = appointment_doc.mode_of_payment
		payments_line.amount = appointment_doc.paid_amount if appointment_doc.paid_amount else 0

	sales_invoice.set_missing_values(for_validate = True)
	return sales_invoice

def appointment_valid_in_fee_validity(appointment, valid_end_date, invoiced, ref_invoice):
	valid_days = frappe.db.get_value("Healthcare Settings", None, "valid_days")
	max_visit = frappe.db.get_value("Healthcare Settings", None, "max_visit")
	valid_start_date = add_days(getdate(valid_end_date), -int(valid_days))

	# Appointments which has same fee validity range with the appointment
	appointments = frappe.get_list("Patient Appointment",{'patient': appointment.patient, 'invoiced': invoiced,
	'appointment_date':("<=", getdate(valid_end_date)), 'appointment_date':(">=", getdate(valid_start_date)),
	'practitioner': appointment.practitioner}, order_by="appointment_date desc", limit=int(max_visit))

	if appointments and len(appointments) > 0:
		appointment_obj = appointments[len(appointments)-1]
		sales_invoice = exists_sales_invoice(appointment_obj)
		if sales_invoice.name == ref_invoice:
			return True
	return False

def cancel_sales_invoice(sales_invoice):
	if frappe.db.get_value("Healthcare Settings", None, "manage_appointment_invoice_automatically") == '1':
		if len(sales_invoice.items) == 1:
			sales_invoice.cancel()
			return True
	return False

def exists_sales_invoice_item(appointment):
	return frappe.db.exists(
		"Sales Invoice Item",
		{
			"reference_dt": "Patient Appointment",
			"reference_dn": appointment.name
		}
	)

def exists_sales_invoice(appointment):
	sales_item_exist = exists_sales_invoice_item(appointment)
	if sales_item_exist:
		sales_invoice = frappe.get_doc("Sales Invoice", frappe.db.get_value("Sales Invoice Item", sales_item_exist, "parent"))
		return sales_invoice
	return False

@frappe.whitelist()
def get_availability_data(date, practitioner):
	"""
	Get availability data of 'practitioner' on 'date'
	:param date: Date to check in schedule
	:param practitioner: Name of the practitioner
	:return: dict containing a list of available slots, list of appointments and time of appointments
	"""

	date = getdate(date)
	weekday = date.strftime("%A")

	available_slots = []
	slot_details = []
	practitioner_schedule = None

	add_events = []
	remove_events = []

	employee = None

	practitioner_obj = frappe.get_doc("Healthcare Practitioner", practitioner)

	# Get practitioner employee relation
	if practitioner_obj.employee:
		employee = practitioner_obj.employee
	elif practitioner_obj.user_id:
		if frappe.db.exists({
			"doctype": "Employee",
			"user_id": practitioner_obj.user_id
			}):
			employee = frappe.get_doc("Employee", {"user_id": practitioner_obj.user_id}).name

	if employee:
		# Check if it is Holiday
		if is_holiday(employee, date):
			frappe.throw(_("{0} is a company holiday".format(date)))

		# Check if He/She on Leave
		leave_record = frappe.db.sql("""select half_day from `tabLeave Application`
			where employee = %s and %s between from_date and to_date
			and docstatus = 1""", (employee, date), as_dict=True)
		if leave_record:
			if leave_record[0].half_day:
				frappe.throw(_("{0} on Half day Leave on {1}").format(practitioner, date))
			else:
				frappe.throw(_("{0} on Leave on {1}").format(practitioner, date))

	# Remove events by repeat_on
	def remove_events_by_repeat_on(events_list):
		weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
		if events_list:
			i = 0
			for event in events_list:
				if event.repeat_this_event:
					if event.repeat_on == "Every Day":
						if event[weekdays[getdate(date).weekday()]]:
							add_events.append(event.copy())
						remove_events.append(event.copy())

					if event.repeat_on=="Every Week":
						if getdate(event.from_date).weekday() == getdate(date).weekday():
							add_events.append(event.copy())
						remove_events.append(event.copy())

					if event.repeat_on=="Every Month":
						if getdate(event.from_date).day == getdate(date).day:
							add_events.append(event.copy())
						remove_events.append(event.copy())

					if event.repeat_on=="Every Year":
						if getdate(event.from_date).strftime("%j") == getdate(date).strftime("%j"):
							add_events.append(event.copy())
						remove_events.append(event.copy())

	# Absent events
	absent_events = frappe.db.sql("""
		select
			name, event, from_time, to_time, from_date, to_date, duration, service_unit, service_unit, repeat_this_event, repeat_on, repeat_till,
			monday, tuesday, wednesday, thursday, friday, saturday, sunday
		from
			`tabPractitioner Event`
		where
			practitioner = %(practitioner)s and present != 1 and
			(
				(repeat_this_event = 1 and (from_date<=%(date)s and ifnull(repeat_till, "3000-01-01")>=%(date)s))
				or
				(repeat_this_event != 1 and (from_date<=%(date)s and to_date>=%(date)s))
			)
	""".format(),{"practitioner": practitioner, "date": getdate(date)}, as_dict=True)

	if absent_events:
		remove_events = []
		add_events = []
		remove_events_by_repeat_on(absent_events)
		for e in remove_events:
			absent_events.remove(e)
		absent_events = absent_events + add_events

	# get practitioners schedule
	enabled_schedule = False
	if practitioner_obj.practitioner_schedules:
		for schedule in practitioner_obj.practitioner_schedules:
			practitioner_schedule = None
			if schedule.schedule:
				if frappe.db.exists(
					"Practitioner Schedule",
					{
						"name": schedule.schedule,
						"disabled": ['!=', 1]
					}
				):
					practitioner_schedule = frappe.get_doc('Practitioner Schedule', schedule.schedule)
					enabled_schedule = True

			if practitioner_schedule:
				available_slots = []
				for t in practitioner_schedule.time_slots:
					if weekday == t.day:
						available_slots.append(t)

				if available_slots:
					appointments = []
					allow_overlap = 0
					service_unit_capacity =0

					if schedule.service_unit:
						slot_name  = schedule.schedule+" - "+schedule.service_unit
						allow_overlap = frappe.get_value('Healthcare Service Unit', schedule.service_unit, 'overlap_appointments')
						service_unit_capacity= frappe.get_value('Healthcare Service Unit', schedule.service_unit, 'total_service_unit_capacity')
						if allow_overlap:
							# fetch all appointments to practitioner by service unit
							appointments = frappe.get_all(
								"Patient Appointment",
								filters={"practitioner": practitioner, "service_unit": schedule.service_unit, "appointment_date": date, "status": ["not in",["Cancelled"]]},
								fields=["name", "appointment_time", "duration", "status"],
								order_by= "appointment_date, appointment_time")
						else:
							# fetch all appointments to service unit
							appointments = frappe.get_all(
								"Patient Appointment",
								filters={"service_unit": schedule.service_unit, "appointment_date": date, "status": ["not in",["Cancelled"]]},
								fields=["name", "appointment_time", "duration", "status"],
								order_by= "appointment_date, appointment_time")
					else:
						slot_name = schedule.schedule
						# fetch all appointments to practitioner without service unit
						appointments = frappe.get_all(
							"Patient Appointment",
							filters={"practitioner": practitioner, "service_unit": '', "appointment_date": date, "status": ["not in",["Cancelled"]]},
							fields=["name", "appointment_time", "duration", "status"],
							order_by= "appointment_date, appointment_time")

					slot_details.append({"slot_name":slot_name, "service_unit":schedule.service_unit,
						"avail_slot":available_slots, 'appointments': appointments, 'absent_events': absent_events,
						'fixed_duration': schedule.always_use_slot_duration_as_appointment_duration,
						'appointment_type': schedule.appointment_type, 'allow_overlap': allow_overlap,
						'service_unit_capacity':service_unit_capacity})

	# Present events
	present_events = frappe.db.sql("""
		select
			name, event, from_time, to_time, from_date, to_date, duration, service_unit, repeat_this_event, repeat_on,
			repeat_till,total_service_unit_capacity, monday, tuesday, wednesday, thursday, friday, saturday, sunday
		from
			`tabPractitioner Event`
		where
			practitioner = %(practitioner)s and present = 1 and
			(
				(repeat_this_event = 1 and (from_date<=%(date)s and ifnull(repeat_till, "3000-01-01")>=%(date)s))
				or
				(repeat_this_event != 1 and (from_date<=%(date)s and to_date>=%(date)s))
			)
		order by
			from_date, from_time
	""".format(),{"practitioner":practitioner, "date":getdate(date)}, as_dict=True)

	present_events_details = []
	if present_events:
		remove_events = []
		add_events = []
		remove_events_by_repeat_on(present_events)
		for e in remove_events:
			present_events.remove(e)
		present_events = present_events + add_events

		for present_event in present_events:
			event_available_slots = []
			total_time_diff = time_diff_in_seconds(present_event.to_time, present_event.from_time)/60
			from_time = present_event.from_time
			slot_name = present_event.event
			appointments = []
			allow_overlap = 0
			service_unit_capacity = 0

			if present_event.service_unit:
				slot_name  = slot_name+" - "+present_event.service_unit
				allow_overlap = frappe.get_value('Healthcare Service Unit', present_event.service_unit, 'overlap_appointments')
				service_unit_capacity= present_event.total_service_unit_capacity
				if allow_overlap:
					# fetch all appointments to practitioner by service unit
					appointments = frappe.get_all(
						"Patient Appointment",
						filters={"practitioner": practitioner, "service_unit": present_event.service_unit, "appointment_date": date, "status": ["not in",["Cancelled"]]},
						fields=["name", "appointment_time", "duration", "status"],
						order_by= "appointment_date, appointment_time")
				else:
					# fetch all appointments to service unit
					appointments = frappe.get_all(
						"Patient Appointment",
						filters={"service_unit": present_event.service_unit, "appointment_date": date, "status": ["not in",["Cancelled"]]},
						fields=["name", "appointment_time", "duration", "status"],
						order_by= "appointment_date, appointment_time")
			else:
				# fetch all appointments to practitioner without service unit
				appointments = frappe.get_all(
					"Patient Appointment",
					filters={"practitioner": practitioner, "service_unit": '', "appointment_date": date, "status": ["not in",["Cancelled"]]},
					fields=["name", "appointment_time", "duration", "status"],
					order_by= "appointment_date, appointment_time")

			for x in range(0, int(total_time_diff), present_event.duration):
				to_time = from_time + datetime.timedelta(seconds=present_event.duration*60)
				event_available_slots.append({'from_time': from_time, 'to_time': to_time})
				from_time = to_time
			present_events_details.append({'slot_name': slot_name, "service_unit":present_event.service_unit, 'event': present_event.name,
			'avail_slot': event_available_slots, 'appointments': appointments, 'absent_events': absent_events,
			'allow_overlap': allow_overlap, 'service_unit_capacity':service_unit_capacity})
	else:
		if not practitioner_obj.practitioner_schedules:
			frappe.throw(_("{0} does not have a Healthcare Practitioner Schedule. Add it in Healthcare Practitioner master".format(practitioner)))
		elif not enabled_schedule:
			frappe.throw(_("{0} does not have an enabled Healthcare Practitioner Schedule.".format(practitioner)))
		elif not available_slots and not slot_details:
			frappe.throw(_("Healthcare Practitioner not available on {0}").format(weekday))

	return {
		"slot_details": slot_details,
		"present_events": present_events_details
	}


@frappe.whitelist()
def update_status(appointment_id, status):
	if status == "Cancelled":
		appointment_cancel(appointment_id)
	appointment_action(frappe.get_doc("Patient Appointment", appointment_id), "SMS", status)
	frappe.db.set_value("Patient Appointment", appointment_id, "status", status)

def appointment_cancel(appointment_id):
	appointment = frappe.get_doc("Patient Appointment", appointment_id)
	from erpnext.healthcare.utils import manage_healthcare_doc_cancel
	manage_healthcare_doc_cancel(appointment)
	from erpnext.healthcare.utils import get_practitioner_charge
	is_ip = True if appointment.inpatient_record else False
	practitioner_charge = get_practitioner_charge(appointment.practitioner, is_ip, appointment.practitioner_event, appointment.appointment_type)
	# If invoiced --> fee_validity update with -1 visit
	if appointment.invoiced and not exists_sales_invoice(appointment) and practitioner_charge and practitioner_charge > 0:
		update_fee_validity(appointment)
	if appointment.procedure_prescription:
		frappe.db.set_value("Procedure Prescription", appointment.procedure_prescription, "appointment_booked", False)
	frappe.msgprint(_("Appointment cancelled"))

def update_fee_validity(appointment):
	validity = validity_exists(appointment.practitioner, appointment.patient)
	if validity:
		fee_validity = frappe.get_doc("Fee Validity", validity[0][0])
		if appointment_valid_in_fee_validity(appointment, fee_validity.valid_till, True, fee_validity.ref_invoice):
			visited = fee_validity.visited - 1
			frappe.db.set_value("Fee Validity", fee_validity.name, "visited", visited)

@frappe.whitelist()
def set_open_appointments():
	today = getdate()
	frappe.db.sql(
		"update `tabPatient Appointment` set status='Open' where status = 'Scheduled'"
		" and appointment_date = %s", today)


@frappe.whitelist()
def set_pending_appointments():
	today = getdate()
	frappe.db.sql(
		"update `tabPatient Appointment` set status='Pending' where status in "
		"('Scheduled','Open') and appointment_date < %s", today)


def confirm_sms(doc):
	if getdate(doc.appointment_date) >= getdate(datetime.date.today()):
		if frappe.db.get_value("Healthcare Settings", None, "app_con") == '1':
			send_confirmation = True
			if frappe.db.get_value("Healthcare Settings", None, "avoid_sms_pr") == '1' and doc.procedure_template:
				send_confirmation = False
			if getdate(datetime.date.today()) == getdate(doc.appointment_date) and frappe.db.get_value("Healthcare Settings", None, "no_con") == '1':
				send_confirmation = False
			if send_confirmation:
				message = frappe.db.get_value("Healthcare Settings", None, "app_con_msg")
				send_message(doc, message)

@frappe.whitelist()
def create_encounter(appointment):
	appointment = frappe.get_doc("Patient Appointment", appointment)
	encounter = frappe.new_doc("Patient Encounter")
	encounter.appointment = appointment.name
	encounter.patient = appointment.patient
	encounter.practitioner = appointment.practitioner
	encounter.visit_department = appointment.department
	encounter.patient_sex = appointment.patient_sex
	encounter.patient_age = get_age(appointment.patient)
	encounter.encounter_date = appointment.appointment_date
	encounter.service_unit = appointment.service_unit
	if appointment.company:
		encounter.company = appointment.company
	encounter.source=appointment.source
	if appointment.referring_practitioner:
		encounter.referring_practitioner=appointment.referring_practitioner
	if appointment.invoiced:
		encounter.invoiced = True
	if appointment.insurance:
		encounter.insurance=appointment.insurance
	if appointment.insurance_approval_number:
		encounter.insurance_approval_number=appointment.insurance_approval_number
	if appointment.insurance_remarks:
		encounter.insurance_remarks=appointment.insurance_remarks
	return encounter.as_dict()

def get_age(patient):
	patient_doc = frappe.get_doc("Patient", patient)
	age_str = ""
	if patient_doc.dob:
		born = getdate(patient_doc.dob)
		from dateutil.relativedelta import relativedelta
		age = relativedelta(getdate(), born)
		age_str = str(age.years) + " year(s) " + str(age.months) + " month(s) " + str(age.days) + " day(s)"
	return age_str

def remind_appointment():
	if frappe.db.get_value("Healthcare Settings", None, "app_rem") == '1':
		appointment_reminder_list = frappe.get_list("Appointment Action",{"parentfield": "appointment_action",
		"parent": "Healthcare Settings", "action_on": "Time Before"})
		if appointment_reminder_list and len(appointment_reminder_list) > 0:
			for appointment_reminder in appointment_reminder_list:
				reminder_obj = frappe.get_doc("Appointment Action", appointment_reminder.name)
				rem_before = reminder_obj.remind_before #datetime.datetime.strptime(reminder_obj.remind_before, "%H:%M:%S")
				# rem_dt = datetime.datetime.now() + datetime.timedelta(
				# 	hours=rem_before.hour, minutes=rem_before.minute, seconds=rem_before.second)
				rem_dt = datetime.datetime.now() + rem_before
				query = """
					select
						name
					from
						`tabPatient Appointment`
					where
						convert(concat(convert(appointment_date, char),' ',convert(appointment_time, char)), datetime) between %s and %s
						and status = %s
					"""
				appointment_list = frappe.db.sql(query, (datetime.datetime.now(), rem_dt, reminder_obj.appointment_status))
				for i in range(0, len(appointment_list)):
					doc = frappe.get_doc("Patient Appointment", appointment_list[i][0])
					app_date_time = datetime.datetime.combine(getdate(doc.appointment_date), get_time(doc.appointment_time))
					app_dt_rem = app_date_time - rem_before
					now = datetime.datetime.now()
					app_dt_dif_in_min = (now - app_dt_rem).seconds/60
					if (app_dt_rem <= now) and (app_dt_dif_in_min<= 4):
						condition_satisfy = True
						if reminder_obj.condition:
							context = get_context(doc)
							if not frappe.safe_eval(reminder_obj.condition, None, context):
								condition_satisfy = False
						if condition_satisfy:
							message = reminder_obj.message_content
							send_message(doc, message)

def get_context(doc):
	from frappe.utils import nowdate
	return {"doc": doc, "nowdate": nowdate, "frappe.utils": frappe.utils}

def appointment_action(appointment_obj, action_type, status=False):
	if action_type == "SMS":
		appointment_reminder_list = frappe.get_list("Appointment Action",{"parentfield": "appointment_action",
		"parent": "Healthcare Settings", "action_on": "Value Change"})
		if appointment_reminder_list and len(appointment_reminder_list) > 0:
			for appointment_reminder in appointment_reminder_list:
				reminder_obj = frappe.get_doc("Appointment Action", appointment_reminder.name)
				condition_satisfy = True
				send_sms = False
				if reminder_obj.condition:
					context = get_context(appointment_obj)
					if not frappe.safe_eval(reminder_obj.condition, {'frappe': frappe}, context):
						condition_satisfy = False
				if condition_satisfy:
					db_appointment_field = frappe.db.get_value("Patient Appointment", appointment_obj.name, reminder_obj.value_change_field)
					obj_appointment_field = appointment_obj.get(reminder_obj.value_change_field)
					if isinstance(db_appointment_field, datetime.timedelta):
						db_appointment_field = str(db_appointment_field)
						obj_appointment_field = str(obj_appointment_field)
					elif isinstance(db_appointment_field, datetime.date):
						obj_appointment_field  = getdate(obj_appointment_field)
					if status and status == reminder_obj.appointment_status:
						if reminder_obj.value_change_field == "status":
							if status != db_appointment_field:
								send_sms = True
						elif db_appointment_field != obj_appointment_field:
							send_sms = True
					elif not status and appointment_obj.status == reminder_obj.appointment_status and db_appointment_field and db_appointment_field != obj_appointment_field:
						send_sms = True
				if send_sms:
					message = reminder_obj.message_content
					send_message(appointment_obj, message)

def send_message(doc, message):
	patient = frappe.get_doc("Patient", doc.patient)
	if patient.mobile:
		context = {"doc": doc, "alert": doc, "comments": None}
		if doc.get("_comments"):
			context["comments"] = json.loads(doc.get("_comments"))

		# jinja to string convertion happens here
		message = frappe.render_template(message, context)
		number = [patient.mobile]
		try:
			send_sms(number, message)
		except Exception as e:
			frappe.msgprint(_("SMS not send Please check your SMS Settings"), alert=True)


@frappe.whitelist()
def get_events(start, end, filters=None):
	"""Returns events for Gantt / Calendar view rendering.

	:param start: Start date-time.
	:param end: End date-time.
	:param filters: Filters (JSON).
	"""
	from frappe.desk.calendar import get_event_conditions
	conditions = get_event_conditions("Patient Appointment", filters)

	data = frappe.db.sql("""
		select
		`tabPatient Appointment`.name, `tabPatient Appointment`.patient,
		`tabPatient Appointment`.practitioner, `tabPatient Appointment`.status,
		`tabPatient Appointment`.duration,
		timestamp(`tabPatient Appointment`.appointment_date, `tabPatient Appointment`.appointment_time) as 'start',
		`tabAppointment Type`.color
		from
		`tabPatient Appointment`
		left join `tabAppointment Type` on `tabPatient Appointment`.appointment_type=`tabAppointment Type`.name
		where
		(`tabPatient Appointment`.appointment_date between %(start)s and %(end)s)
		and `tabPatient Appointment`.status != 'Cancelled' and `tabPatient Appointment`.docstatus < 2 {conditions}""".format(conditions=conditions),
		{"start": start, "end": end}, as_dict=True, update={"allDay": 0})

	for item in data:
		item.end = item.start + datetime.timedelta(minutes = item.duration)

	return data

@frappe.whitelist()
def get_procedure_prescribed(patient, encounter_practitioner=False, procedure_practitioner=False):
	query = """
		select
			pp.name, pp.procedure, pp.parent, ct.practitioner, ct.encounter_date, pp.practitioner, pp.date,
			pp.department, ct.source, ct.referring_practitioner
		from
			`tabPatient Encounter` ct, `tabProcedure Prescription` pp
		where
			ct.patient='{0}' and pp.parent=ct.name and pp.appointment_booked=0"""

	if encounter_practitioner:
		query +=""" and ct.practitioner=%(encounter_practitioner)s"""

	if procedure_practitioner:
		query +=""" and pp.practitioner=%(procedure_practitioner)s"""

	query +="""
		order by
			ct.creation desc"""

	return frappe.db.sql(query.format(patient),{
		"encounter_practitioner": encounter_practitioner,
		"procedure_practitioner": procedure_practitioner
	})
@frappe.whitelist()
def invoice_from_appointment(appointment_id):
	appointment = frappe.get_doc("Patient Appointment", appointment_id)
	sales_invoice = set_invoice_details_for_appointment(appointment, False)
	return sales_invoice.as_dict() if sales_invoice else False

def verify_repetition(doc):
	if frappe.db.exists('Patient Appointment', { 'status': ['!=', 'Cancelled'], 'appointment_date': doc.appointment_date, 'appointment_time': doc.appointment_time, 'patient':doc.patient }):
		frappe.throw(_('Appointment is already existing for the patient at the same time'))

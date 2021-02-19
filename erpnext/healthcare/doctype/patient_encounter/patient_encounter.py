# -*- coding: utf-8 -*-
# Copyright (c) 2015, ESS LLP and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr
from erpnext.healthcare.utils import manage_healthcare_doc_cancel, create_insurance_approval_doc
from erpnext.healthcare.doctype.patient_appointment.patient_appointment import update_status
from erpnext.healthcare.utils import create_insurance_claim

class PatientEncounter(Document):
	def validate(self):
		if self.service_unit:
			service_unit_company = frappe.db.get_value("Healthcare Service Unit", self.service_unit, "company")
			if service_unit_company and service_unit_company != self.company:
				self.company = service_unit_company
		if self.appointment:
			existing_encounter = frappe.db.exists('Patient Encounter', {'appointment': self.appointment, 'docstatus': 1})
			if existing_encounter:
				msg = _("Already created Patient Encounter- ")
				msg +=  " <b><a href='#Form/Patient Encounter/{0}'>{0}</a></b> for appointment {1}".format(self.name, self.appointment)
				frappe.throw(msg, title=_('Not Allowed'))

	def on_update(self):
		if self.appointment and self.docstatus == 0:
			update_status(self.appointment, "In Progress")
		update_encounter_to_medical_record(self)
		self.reload()

	def after_insert(self):
		insert_encounter_to_medical_record(self)
		from erpnext.healthcare.utils import get_practitioner_charge
		is_ip = True if self.inpatient_record else False
		practitioner_event = False
		appointment_type = False
		if self.appointment:
			practitioner_event, appointment_type = frappe.db.get_values("Patient Appointment", self.appointment, ["practitioner_event", "appointment_type"])[0]
		if not get_practitioner_charge(self.practitioner, is_ip, practitioner_event, appointment_type):
			frappe.db.set_value("Patient Encounter", self.name, "invoiced", True)

	def on_cancel(self):
		manage_healthcare_doc_cancel(self)
		if(self.appointment):
			update_status(self.appointment, "Open")
		delete_medical_record(self)

	def on_submit(self):
		if self.appointment:
			update_status(self.appointment, "Closed")
		make_insurance_claim(self)
		# if self.insurance:
		# 	is_insurance_approval = frappe.get_value("Insurance Company", (frappe.get_value("Insurance Assignment", self.insurance, "insurance_company")), "is_insurance_approval")
		# 	if is_insurance_approval:
		# 		create_insurance_approval_doc(self)


	def before_cancel(self):
		self.validate_orders()

	# Call before delete
	def on_trash(self):
		self.validate_orders()
		from erpnext.healthcare.utils import check_if_healthcare_doc_is_linked
		check_if_healthcare_doc_is_linked(self, "Cancel")

	def validate_orders(self):
		if self.lab_test_prescription:
			can_not_delete = False
			for lab_rx in self.lab_test_prescription:
				if lab_rx.invoiced:
					can_not_delete = True
					msg = "Invoiced lab test prescription(s)"
				elif lab_rx.lab_test_created:
					can_not_delete = True
					msg = "Lab Test created from procedure prescription"
			if can_not_delete:
				frappe.throw(_("Not permitted. "+msg))
		if self.procedure_prescription:
			can_not_delete = False
			for procedure_rx in self.procedure_prescription:
				if procedure_rx.invoiced:
					can_not_delete = True
					msg = "Invoiced procedure prescription(s)"
				elif procedure_rx.procedure_created:
					can_not_delete = True
					msg = "Procedure created from procedure prescription"
				elif procedure_rx.appointment_booked:
					can_not_delete = True
					msg = "Appointment booked for procedure from procedure prescription"
			if can_not_delete:
				frappe.throw(_("Not permitted. "+msg))

def insert_encounter_to_medical_record(doc):
	subject = set_subject_field(doc)
	medical_record = frappe.new_doc("Patient Medical Record")
	medical_record.patient = doc.patient
	medical_record.subject = subject
	medical_record.status = "Open"
	medical_record.communication_date = doc.encounter_date
	medical_record.reference_doctype = "Patient Encounter"
	medical_record.reference_name = doc.name
	medical_record.reference_owner = doc.owner
	medical_record.save(ignore_permissions=True)

def update_encounter_to_medical_record(encounter):
	medical_record_id = frappe.db.sql("select name from `tabPatient Medical Record` where reference_name=%s", (encounter.name))
	if medical_record_id and medical_record_id[0][0]:
		subject = set_subject_field(encounter)
		frappe.db.set_value("Patient Medical Record", medical_record_id[0][0], "subject", subject)
	else:
		insert_encounter_to_medical_record(encounter)

def delete_medical_record(encounter):
	frappe.db.sql("""delete from `tabPatient Medical Record` where reference_name = %s""", (encounter.name))

def set_subject_field(encounter):
	subject = encounter.practitioner+"<br/>"
	if(encounter.symptoms):
		subject += "Symptoms: "+ cstr(encounter.symptoms)+".<br/>"
	else:
		subject += "No Symptoms <br/>"
	if(encounter.diagnosis):
		subject += "Diagnosis: "+ cstr(encounter.diagnosis)+".<br/>"
	else:
		subject += "No Diagnosis <br/>"
	if(encounter.drug_prescription):
		subject +="\nDrug(s) Prescribed. "
	if(encounter.lab_test_prescription):
		subject += "\nTest(s) Prescribed."
	if(encounter.procedure_prescription):
		subject += "\nProcedure(s) Prescribed."

	return subject

def make_insurance_claim(doc):
	if doc.insurance_subscription:
		from erpnext.healthcare.utils import create_insurance_claim, get_service_item_and_practitioner_charge
		ip = True if doc.inpatient_record else False
		billing_item, rate  = get_service_item_and_practitioner_charge(doc.practitioner, ip= ip, practitioner_event= None, appointment_type=doc.type)
		insurance_claim, claim_status = create_insurance_claim(doc, 'Appointment Type', doc.type, 1, billing_item)
		if insurance_claim:
			frappe.set_value(doc.doctype, doc.name ,'insurance_claim', insurance_claim)
			frappe.set_value(doc.doctype, doc.name ,'claim_status', claim_status)
		if doc.lab_test_prescription:
			for lab_rx in doc.lab_test_prescription:
				if lab_rx.lab_test_code:
					billing_item = frappe.get_cached_value('Lab Test Template', lab_rx.lab_test_code, 'item')
					insurance_claim, claim_status = create_insurance_claim(doc, 'Lab Test Template', lab_rx.lab_test_code, 1, billing_item)
					if insurance_claim:
						frappe.db.set_value(lab_rx.doctype, lab_rx.name, "insurance_claim", insurance_claim)
					if claim_status:
						frappe.db.set_value(lab_rx.doctype, lab_rx.name, "claim_status", claim_status)
		if doc.procedure_prescription:
			for procedure_rx in doc.procedure_prescription:
				if procedure_rx.procedure:
					billing_item = frappe.get_cached_value('Clinical Procedure Template', procedure_rx.procedure, 'item')
					insurance_claim, claim_status = create_insurance_claim(doc, 'Clinical Procedure Template', procedure_rx.procedure, 1, billing_item)
					if insurance_claim:
						frappe.db.set_value(procedure_rx.doctype, procedure_rx.name, "insurance_claim", insurance_claim)
					if claim_status:
						frappe.db.set_value(procedure_rx.doctype, procedure_rx.name, "claim_status", claim_status)
		if doc.radiology_procedure_prescription:
			for radiology in doc.radiology_procedure_prescription:
				if radiology.radiology_procedure:
					billing_item = frappe.get_cached_value('Radiology Procedure', radiology.radiology_procedure, 'item')
					insurance_claim, status = create_insurance_claim(doc, 'Radiology Procedure', radiology.radiology_procedure, 1, billing_item)
					if insurance_claim:
						frappe.db.set_value(radiology.doctype, radiology.name, "insurance_claim", insurance_claim)
					if claim_status:
						frappe.db.set_value(radiology.doctype, radiology.name, "claim_status", claim_status)
		if doc.drug_prescription:
			for drug in doc.drug_prescription:
				if drug.drug_code:
					billing_item = drug.drug_code
					insurance_claim, status = create_insurance_claim(doc, 'Item', drug.drug_code, 1, billing_item)
					if insurance_claim:
						frappe.db.set_value(drug.doctype, drug.name, "insurance_claim", insurance_claim)
					if claim_status:
						frappe.db.set_value(drug.doctype, drug.name, "claim_status", claim_status)
		doc.reload()
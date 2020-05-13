# -*- coding: utf-8 -*-
# Copyright (c) 2015, ESS and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, cstr, now_datetime, today, month_diff, date_diff
from erpnext.healthcare.doctype.healthcare_settings.healthcare_settings import get_receivable_account

class LabTest(Document):
	def on_submit(self):
		frappe.db.set_value(self.doctype,self.name,"submitted_date", getdate())
		insert_lab_test_to_medical_record(self)
		frappe.db.set_value("Lab Test", self.name, "status", "Completed")
		if self.inpatient_record and frappe.db.get_value("Healthcare Settings", None, "auto_invoice_inpatient") == '1':
			self.invoice()
		if self.insurance:
			from erpnext.healthcare.utils import create_insurance_approval_doc
			create_insurance_approval_doc(self)

	def invoice(self):
		if not self.invoiced:
			return invoice_lab_test(self)
		return False

	def on_cancel(self):
		if self.invoiced and not self.reference_dt == "Clinical Procedure" and not self.reference_dn:
			frappe.throw(_("Can not cancel invoiced {0}").format(self.doctype))
		delete_lab_test_from_medical_record(self)
		frappe.db.set_value("Lab Test", self.name, "status", "Cancelled")
		self.reload()

	def on_update(self):
		if(self.sensitivity_test_items):
			sensitivity = sorted(self.sensitivity_test_items, key=lambda x: x.antibiotic_sensitivity)
			for i, item in enumerate(sensitivity):
				item.idx = i+1
			self.sensitivity_test_items = sensitivity

	def after_insert(self):
		if(self.prescription):
			frappe.db.set_value("Lab Prescription", self.prescription, "lab_test_created", 1)
			if frappe.db.get_value("Lab Prescription", self.prescription, 'invoiced') == 1:
				self.invoiced = True
		if not self.lab_test_name and self.template:
			self.load_test_from_template()
			self.reload()

	def load_test_from_template(self):
		lab_test = self
		create_test_from_template(lab_test)
		self.reload()

	def validate(self):
		self.set_secondary_uom_result_value()

	def before_print(self):
		if self.docstatus == 1 and not self.printed and (frappe.db.get_value("Healthcare Settings", None, "require_test_result_approval") != 1 \
			or self.status == "Approved"):
				frappe.db.set_value("Lab Test", self.name, "printed_on", now_datetime())
				frappe.db.set_value("Lab Test", self.name, "printed", True)

	def set_secondary_uom_result_value(self):
		for item in self.normal_test_items:
			if item.secondary_uom and item.conversion_factor:
				try:
					item.secondary_uom_result = float(item.result_value) * float(item.conversion_factor)
				except:
					pass

def create_test_from_template(lab_test):
	template = frappe.get_doc("Lab Test Template", lab_test.template)
	patient = frappe.get_doc("Patient", lab_test.patient)

	lab_test.lab_test_name = template.lab_test_name
	lab_test.result_date = getdate()
	lab_test.department = template.department
	lab_test.lab_test_group = template.lab_test_group

	lab_test = create_sample_collection(lab_test, template, patient, None)
	lab_test = load_result_format(lab_test, template, None, None)

@frappe.whitelist()
def update_status(status, name):
	frappe.db.sql("""update `tabLab Test` set status=%s, approved_date=%s where name = %s""", (status, getdate(), name))

@frappe.whitelist()
def update_lab_test_print_sms_email_status(print_sms_email, name):
	frappe.db.set_value("Lab Test",name,print_sms_email,1)

@frappe.whitelist()
def create_multiple(doctype, docname):
	lab_test_created = False
	if doctype == "Sales Invoice":
		lab_test_created = create_lab_test_from_invoice(docname)
	elif doctype == "Patient Encounter":
		lab_test_created = create_lab_test_from_encounter(docname)

	if lab_test_created:
		frappe.msgprint(_("Lab Test(s) "+lab_test_created+" created."))

	return lab_test_created

def create_lab_test_from_encounter(encounter_id):
	lab_test_created = False
	encounter = frappe.get_doc("Patient Encounter", encounter_id)

	lab_test_ids = frappe.db.sql("""select lp.name, lp.lab_test_code, lp.invoiced
	from `tabPatient Encounter` et, `tabLab Prescription` lp
	where et.patient=%s and lp.parent=%s and
	lp.parent=et.name and lp.lab_test_created=0 and et.docstatus<2""", (encounter.patient, encounter_id))

	if lab_test_ids:
		patient = frappe.get_doc("Patient", encounter.patient)
		for lab_test_id in lab_test_ids:
			template = get_lab_test_template(lab_test_id[1])
			if template:
				lab_test = create_lab_test_doc(lab_test_id[2], encounter.practitioner, patient, template, encounter.source, encounter.visit_department)
				lab_test.save(ignore_permissions = True)
				frappe.db.set_value("Lab Prescription", lab_test_id[0], "lab_test_created", 1)
				if not lab_test_created:
					lab_test_created = lab_test.name
				else:
					lab_test_created += ", "+lab_test.name
	return lab_test_created


def create_lab_test_from_invoice(invoice_name):
	lab_tests_created = False
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	if invoice.patient:
		patient = frappe.get_doc("Patient", invoice.patient)
		for item in invoice.items:
			lab_test_created = 0
			if item.reference_dt == "Lab Prescription":
				lab_test_created = frappe.db.get_value("Lab Prescription", item.reference_dn, "lab_test_created")
			elif item.reference_dt == "Lab Test":
				lab_test_created = 1
			if lab_test_created != 1:
				template = get_lab_test_template(item.item_code)
				if template:
					lab_test = create_lab_test_doc(True, invoice.ref_practitioner, patient, template)
					if item.reference_dt == "Lab Prescription":
						lab_test.prescription = item.reference_dn
					lab_test.save(ignore_permissions = True)
					if item.reference_dt != "Lab Prescription":
						frappe.db.set_value("Sales Invoice Item", item.name, "reference_dt", "Lab Test")
						frappe.db.set_value("Sales Invoice Item", item.name, "reference_dn", lab_test.name)
					if not lab_tests_created:
						lab_tests_created = lab_test.name
					else:
						lab_tests_created += ", "+lab_test.name
	return lab_tests_created

def get_lab_test_template(item):
	template_id = check_template_exists(item)
	if template_id:
		return frappe.get_doc("Lab Test Template", template_id)
	return False

def check_template_exists(item):
	template_exists = frappe.db.exists(
		"Lab Test Template",
		{
			'item': item
		}
	)
	if template_exists:
		return template_exists
	return False

def create_lab_test_doc(invoiced, practitioner, patient, template, source="Direct", requesting_department=None):
	lab_test = frappe.new_doc("Lab Test")
	lab_test.invoiced = invoiced
	lab_test.practitioner = practitioner
	lab_test.patient = patient.name
	lab_test.patient_age = patient.get_age()
	lab_test.patient_sex = patient.sex
	lab_test.email = patient.email
	lab_test.mobile = patient.mobile
	lab_test.department = template.department
	lab_test.template = template.name
	lab_test.lab_test_group = template.lab_test_group
	lab_test.result_date = getdate()
	lab_test.report_preference = patient.report_preference
	lab_test.source = source
	if requesting_department:
		lab_test.requesting_department=requesting_department
	return lab_test

def create_normals(template, lab_test):
	lab_test.normal_toggle = "1"
	normal = lab_test.append("normal_test_items")
	normal.lab_test_name = template.lab_test_name
	normal.lab_test_uom = template.lab_test_uom
	if template.secondary_uom:
		normal.secondary_uom = template.secondary_uom
		normal.conversion_factor = template.conversion_factor
	normal.type = template.type
	if normal.type=="Select":
		normal.options = template.options
	if template.normal_range:
		normal.normal_range = get_normal_range(lab_test, template.normal_range)
	normal.require_result_value = 1
	normal.allow_blank = template.allow_blank
	normal.template = template.name

def get_normal_range(lab_test, normal_range_doc_id):
	normal_range_doc = frappe.get_doc("Lab Test Normal Range", normal_range_doc_id)
	patient = frappe.get_doc("Patient", lab_test.patient)
	normal_range = False
	if normal_range_doc.normal_range_condition:
		for item in normal_range_doc.normal_range_condition:
			if (item.gender and patient.sex and patient.sex == item.gender) or not item.gender:
				normal_range = get_conditional_normal_range(item, patient, normal_range)

	return normal_range if normal_range else normal_range_doc.default_normal_range

def get_conditional_normal_range(item, patient, normal_range):
	if not item.condition_formula:
		return item.normal_range
	if item.condition_formula:
		import datetime
		whitelisted_globals = {
			"int": int,
			"float": float,
			"long": int,
			"round": round,
			"date": datetime.date,
			"getdate": getdate
		}
		data = frappe._dict()
		data.update(patient.as_dict())
		age = 0
		if patient.dob:
			if item.calculate_age_by == "Year":
				age = month_diff(today(), getdate(patient.dob))-1/12
			elif item.calculate_age_by == "Month":
				age = month_diff(today(), getdate(patient.dob))-1
			elif item.calculate_age_by == "Day":
				age = date_diff(today(), getdate(patient.dob))+1
		data.update({'age': age})
		if frappe.safe_eval(item.condition_formula, whitelisted_globals, data):
			normal_range = item.normal_range
	return normal_range

def create_compounds(template, lab_test, is_group):
	lab_test.normal_toggle = "1"
	for normal_test_template in template.normal_test_templates:
		normal = lab_test.append("normal_test_items")
		if is_group:
			normal.lab_test_event = normal_test_template.lab_test_event
		else:
			normal.lab_test_name = normal_test_template.lab_test_event

		normal.lab_test_uom = normal_test_template.lab_test_uom
		if normal_test_template.secondary_uom:
			normal.secondary_uom = normal_test_template.secondary_uom
			normal.conversion_factor = normal_test_template.conversion_factor
		if normal_test_template.compound_normal_range:
			normal.normal_range = get_normal_range(lab_test, normal_test_template.compound_normal_range)
		normal.type = normal_test_template.type
		if normal.type=="Select":
			normal.options = normal_test_template.options
		normal.require_result_value = 1
		normal.allow_blank = normal_test_template.allow_blank
		normal.template = template.name

def create_specials(template, lab_test, is_group):
	lab_test.special_toggle = "1"
	if(template.sensitivity):
		lab_test.sensitivity_toggle = "1"

	for special_test_template in template.special_test_template:
		special = lab_test.append("special_test_items")
		special.lab_test_particulars = special_test_template.particulars
		special.require_result_value = 1
		special.allow_blank = special_test_template.allow_blank
		special.template = template.name
		if is_group:
			special.lab_test_name = template.lab_test_name

def create_sample_doc(template, patient, invoice):
	if(template.sample):
		sample_exist = frappe.db.exists({
			"doctype": "Sample Collection",
			"patient": patient.name,
			"docstatus": 0,
			"sample": template.sample})
		if sample_exist :
			#Update Sample Collection by adding quantity
			sample_collection = frappe.get_doc("Sample Collection",sample_exist[0][0])
			quantity = int(sample_collection.sample_quantity)+int(template.sample_quantity)
			if(template.sample_collection_details):
				sample_collection_details = sample_collection.sample_collection_details+"\n==============\n"+"Test :"+template.lab_test_name+"\n"+"Collection Detials:\n\t"+template.sample_collection_details
				frappe.db.set_value("Sample Collection", sample_collection.name, "sample_collection_details",sample_collection_details)
			frappe.db.set_value("Sample Collection", sample_collection.name, "sample_quantity",quantity)

		else:
			#create Sample Collection for template, copy vals from Invoice
			sample_collection = frappe.new_doc("Sample Collection")
			if(invoice):
				sample_collection.invoiced = True
			sample_collection.patient = patient.name
			sample_collection.patient_age = patient.get_age()
			sample_collection.patient_sex = patient.sex
			sample_collection.sample = template.sample
			sample_collection.sample_uom = template.sample_uom
			sample_collection.sample_quantity = template.sample_quantity
			if(template.sample_collection_details):
				sample_collection.sample_collection_details = "Test :"+template.lab_test_name+"\n"+"Collection Detials:\n\t"+template.sample_collection_details
			sample_collection.save(ignore_permissions=True)

		return sample_collection

def create_sample_collection(lab_test, template, patient, invoice):
	if(frappe.db.get_value("Healthcare Settings", None, "require_sample_collection") == "1"):
		sample_collection = create_sample_doc(template, patient, invoice)
		if(sample_collection):
			lab_test.sample = sample_collection.name
			lab_test.sample_collection_details = template.sample_collection_details
	return lab_test

def load_result_format(lab_test, template, prescription, invoice):
	if(template.lab_test_template_type == 'Single'):
		create_normals(template, lab_test)
	elif(template.lab_test_template_type == 'Compound'):
		create_compounds(template, lab_test, False)
	elif(template.lab_test_template_type == 'Descriptive'):
		create_specials(template, lab_test, False)
	elif(template.lab_test_template_type == 'Grouped'):
		#iterate for each template in the group and create one result for all.
		for lab_test_group in template.lab_test_groups:
			#template_in_group = None
			if(lab_test_group.lab_test_template):
				template_in_group = frappe.get_doc("Lab Test Template",
								lab_test_group.lab_test_template)
				if(template_in_group):
					if(template_in_group.lab_test_template_type == 'Single'):
						create_normals(template_in_group, lab_test)
					elif(template_in_group.lab_test_template_type == 'Compound'):
						normal_heading = lab_test.append("normal_test_items")
						normal_heading.lab_test_name = template_in_group.lab_test_name
						normal_heading.require_result_value = 0
						normal_heading.template = template_in_group.name
						create_compounds(template_in_group, lab_test, True)
					elif(template_in_group.lab_test_template_type == 'Descriptive'):
						create_specials(template_in_group, lab_test, True)
			else:
				normal = lab_test.append("normal_test_items")
				normal.lab_test_name = lab_test_group.group_event
				normal.lab_test_uom = lab_test_group.group_test_uom
				if lab_test_group.secondary_uom:
					normal.secondary_uom = lab_test_group.secondary_uom
					normal.conversion_factor = lab_test_group.conversion_factor
				if lab_test_group.group_normal_range:
					normal.normal_range = get_normal_range(lab_test, lab_test_group.group_normal_range)
				normal.require_result_value = 1
				normal.allow_blank = lab_test_group.allow_blank
				normal.template = template.name
	if(template.lab_test_template_type != 'No Result'):
		if(prescription):
			lab_test.prescription = prescription
			if(invoice):
				frappe.db.set_value("Lab Prescription", prescription, "invoiced", True)
		lab_test.save(ignore_permissions=True) # insert the result
		return lab_test

@frappe.whitelist()
def get_employee_by_user_id(user_id):
	emp_id = frappe.db.get_value("Employee",{"user_id":user_id})
	employee = frappe.get_doc("Employee",emp_id)
	return employee

def insert_lab_test_to_medical_record(doc):
	table_row = False
	subject = cstr(doc.lab_test_name)
	if doc.practitioner:
		subject += " "+ doc.practitioner
	if doc.normal_test_items:
		item = doc.normal_test_items[0]
		comment = ""
		if item.lab_test_comment:
			comment = str(item.lab_test_comment)
		event = ""
		if item.lab_test_event:
			event = item.lab_test_event
		if item.lab_test_name:
			table_row = item.lab_test_name
		if table_row:
			table_row += " "+ event
		else:
			table_row = event
		if item.result_value:
			table_row += " "+ item.result_value
		if item.normal_range:
			table_row += " normal_range("+item.normal_range+")"
		table_row += " "+comment

	elif doc.special_test_items:
		item = doc.special_test_items[0]

		if item.lab_test_particulars and item.result_value:
			table_row = item.lab_test_particulars +" "+ item.result_value

	elif doc.sensitivity_test_items:
		item = doc.sensitivity_test_items[0]

		if item.antibiotic and item.antibiotic_sensitivity:
			table_row = item.antibiotic +" "+ item.antibiotic_sensitivity

	if table_row:
		subject += "<br/>"+table_row
	if doc.lab_test_comment:
		subject += "<br/>"+ cstr(doc.lab_test_comment)

	medical_record = frappe.new_doc("Patient Medical Record")
	medical_record.patient = doc.patient
	medical_record.subject = subject
	medical_record.status = "Open"
	medical_record.communication_date = doc.result_date
	medical_record.reference_doctype = "Lab Test"
	medical_record.reference_name = doc.name
	medical_record.reference_owner = doc.owner
	medical_record.save(ignore_permissions=True)

def delete_lab_test_from_medical_record(self):
	medical_record_id = frappe.db.sql("select name from `tabPatient Medical Record` where reference_name=%s",(self.name))

	if medical_record_id and medical_record_id[0][0]:
		frappe.delete_doc("Patient Medical Record", medical_record_id[0][0])

@frappe.whitelist()
def get_lab_test_prescribed(patient):
	return frappe.db.sql("""select cp.name, cp.lab_test_code, cp.parent, cp.invoiced, ct.practitioner, ct.encounter_date, ct.source, ct.referring_practitioner, ct.insurance, ct.visit_department from `tabPatient Encounter` ct,
	`tabLab Prescription` cp where ct.patient=%s and cp.parent=ct.name and cp.lab_test_created=0""", (patient))

def invoice_lab_test(lab_test):
	sales_invoice = frappe.new_doc("Sales Invoice")
	sales_invoice.patient = lab_test.patient
	sales_invoice.patient_name = frappe.db.get_value("Patient", lab_test.patient, "patient_name")
	sales_invoice.customer = frappe.db.get_value("Patient", lab_test.patient, "customer")
	sales_invoice.due_date = getdate()
	sales_invoice.inpatient_record = lab_test.inpatient_record
	sales_invoice.company = lab_test.company
	sales_invoice.debit_to = get_receivable_account(lab_test.company, lab_test.patient)

	item_line = sales_invoice.append("items")
	item_line.item_code = frappe.db.get_value("Lab Test Template", lab_test.template, "item")
	from erpnext.healthcare.utils import sales_item_details_for_healthcare_doc
	item_details = sales_item_details_for_healthcare_doc(item_line.item_code, lab_test)
	item_line.item_name = item_details.item_name
	item_line.description = frappe.db.get_value("Item", item_line.item_code, "description")
	item_line.rate = item_details.price_list_rate
	if lab_test.insurance and item_line.item_code:
		from erpnext.healthcare.utils import get_insurance_details
		patient_doc= frappe.get_doc("Patient", lab_test.patient)
		validate_insurance_on_invoice= frappe.db.get_value("Healthcare Settings", None, "validate_insurance_on_invoice")
		valid_date = lab_test.submitted_date if validate_insurance_on_invoice=="1" else getdate()
		insurance_details = get_insurance_details(lab_test.insurance, item_line.item_code, patient_doc)
		if insurance_details:
			item_line.discount_percentage = insurance_details.discount
			if insurance_details.rate and insurance_details.rate > 0:
				item_line.rate = insurance_details.rate
			if item_line.discount_percentage and float(item_line.discount_percentage) > 0:
				item_line.discount_amount = float(item_line.rate) * float(item_line.discount_percentage) * 0.01
				if item_line.discount_amount and item_line.discount_amount > 0:
					item_line.rate = float(item_line.rate) - float(item_line.discount_amount)
			item_line.insurance_claim_coverage = insurance_details.coverage
			item_line.insurance_approval_number=  lab_test.insurance_approval_number if lab_test.insurance_approval_number else ''
	item_line.qty = 1
	item_line.reference_dt = "Lab Test"
	item_line.reference_dn = lab_test.name
	item_line.rate  = float(item_line.rate)
	item_line = set_revenue_sharing_distribution(sales_invoice, item_line)
	item_line.amount = item_line.rate*item_line.qty
	if lab_test.insurance and item_line.insurance_claim_coverage and float(item_line.insurance_claim_coverage) > 0:
		item_line.insurance_claim_amount = item_line.amount*0.01*float(item_line.insurance_claim_coverage)
		sales_invoice.total_insurance_claim_amount = item_line.insurance_claim_amount

	sales_invoice.set_missing_values(for_validate = True)

	sales_invoice.save(ignore_permissions=True)
	return sales_invoice if sales_invoice else False



@frappe.whitelist()
def set_revenue_sharing_distribution(doc, invoice_item):
	doc.set("practitioner_revenue_distributions", [])
	from erpnext.healthcare.utils import get_revenue_sharing_distribution
	distributions=get_revenue_sharing_distribution(invoice_item)
	if distributions:
		for distribution in distributions:
			dist_line = doc.append("practitioner_revenue_distributions", {})
			dist_line.practitioner= distribution["practitioner"]
			dist_line.item_code= distribution["item_code"]
			dist_line.item_amount= distribution["item_amount"]
			dist_line.amount= distribution["amount"]
			dist_line.mode_of_sharing = distribution["type_of_sharing"]
			dist_line.reference_dt= distribution["reference_dt"]
			dist_line.reference_dn= distribution["reference_dn"]
			reference_doc=frappe.get_doc(dist_line.reference_dt, dist_line.reference_dn)
			allow_split = frappe.db.get_value("Healthcare Settings", None, "practitioner_charge_separately")
			if allow_split =="1":
				practitioner_charge_item = frappe.db.get_value("Healthcare Settings", None, "practitioner_charge_item")
				if practitioner_charge_item:
					set_revenue_sharing_item(doc,dist_line, practitioner_charge_item, reference_doc)
					invoice_item.rate=invoice_item.rate-(dist_line.amount/invoice_item.qty)
	return invoice_item

@frappe.whitelist()
def set_revenue_sharing_item(doc, dist_line, practitioner_charge_item, reference_doc):
	item_line = doc.append("items")
	item_line.item_code = practitioner_charge_item
	from erpnext.healthcare.utils import sales_item_details_for_healthcare_doc
	item_details = sales_item_details_for_healthcare_doc(item_line.item_code, doc)
	item_line.item_name = item_details.item_name
	item_line.description = frappe.db.get_value("Item", item_line.item_code, "description")
	item_line.rate = dist_line.amount
	if reference_doc.insurance and item_line.item_code:
		from erpnext.healthcare.utils import get_insurance_details
		patient_doc= frappe.get_doc("Patient", doc.patient)
		insurance_details = get_insurance_details(reference_doc.insurance, item_line.item_code, patient_doc, getdate())
		if insurance_details:
			item_line.insurance_claim_coverage = insurance_details.coverage
			item_line.insurance_approval_number=  reference_doc.insurance_approval_number if reference_doc.insurance_approval_number else ''
	item_line.qty = 1
	item_line.amount = item_line.rate*item_line.qty
	item_line.reference_dt = reference_doc.doctype
	item_line.reference_dn = reference_doc.name
	if reference_doc.insurance and item_line.insurance_claim_coverage and float(item_line.insurance_claim_coverage) > 0:
		item_line.insurance_claim_amount = item_line.amount*0.01*float(item_line.insurance_claim_coverage)
		doc.total_insurance_claim_amount =+ item_line.insurance_claim_amount
# -*- coding: utf-8 -*-
# Copyright (c) 2015, ESS LLP and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe import throw, _
from frappe.utils import cstr
from erpnext.accounts.party import validate_party_accounts
from frappe.contacts.address_and_contact import load_address_and_contact, delete_contact_and_address
from frappe.desk.reportview import build_match_conditions, get_filters_cond
from frappe.model.naming import set_name_by_naming_series

class HealthcarePractitioner(Document):
	def onload(self):
		load_address_and_contact(self)

	def autoname(self):
		naming_method = frappe.db.get_value("Healthcare Settings", None, "practitioner_name_by")
		if not naming_method:
			throw(_("Please setup Healthcare Practitioner Naming System in Healthcare > Healthcare Settings"))
		else:
			if naming_method == 'Naming Series':
				set_name_by_naming_series(self)
			elif naming_method == 'Full Name':
				self.set_practitioner_name()
				self.name = self.practitioner_name

	def validate(self):
		self.set_practitioner_name()
		validate_party_accounts(self)
		if self.inpatient_visit_charge_item:
			validate_service_item(self.inpatient_visit_charge_item, "Configure a service Item for Inpatient Visit Charge Item")
		if self.op_consulting_charge_item:
			validate_service_item(self.op_consulting_charge_item, "Configure a service Item for Out Patient Consulting Charge Item")

		if self.user_id:
			self.validate_for_enabled_user_id()
			self.validate_duplicate_user_id()
			existing_user_id = frappe.db.get_value("Healthcare Practitioner", self.name, "user_id")
			if self.user_id != existing_user_id:
				frappe.permissions.remove_user_permission(
					"Healthcare Practitioner", self.name, existing_user_id)

		else:
			existing_user_id = frappe.db.get_value("Healthcare Practitioner", self.name, "user_id")
			if existing_user_id:
				frappe.permissions.remove_user_permission(
					"Healthcare Practitioner", self.name, existing_user_id)
		if self.employee:
		    self.validate_employee_details()

	def set_practitioner_name(self):
		self.practitioner_name = ' '.join(filter(lambda x: x, [self.first_name, self.middle_name, self.last_name]))

	def on_update(self):
		if self.user_id:
			frappe.permissions.add_user_permission("Healthcare Practitioner", self.name, self.user_id)

	def validate_employee_details(self):
		data = frappe.db.get_value('Employee',
			self.employee, ['image'], as_dict=1)
		if data.get("image"):
			self.image = data.get("image")

	def validate_for_enabled_user_id(self):
		enabled = frappe.db.get_value("User", self.user_id, "enabled")
		if enabled is None:
			frappe.throw(_("User {0} does not exist").format(self.user_id))
		if enabled == 0:
			frappe.throw(_("User {0} is disabled").format(self.user_id))

	def validate_duplicate_user_id(self):
		practitioner = frappe.db.sql_list("""select name from `tabHealthcare Practitioner` where
			user_id=%s and name!=%s""", (self.user_id, self.name))
		if practitioner:
			throw(_("User {0} is already assigned to Healthcare Practitioner {1}").format(
				self.user_id, practitioner[0]), frappe.DuplicateEntryError)

	def on_trash(self):
		delete_contact_and_address('Healthcare Practitioner', self.name)

def validate_service_item(item, msg):
	if frappe.db.get_value("Item", item, "is_stock_item") == 1:
		frappe.throw(_(msg))

def get_practitioner_list(doctype, txt, searchfield, start, page_len, filters):
	from frappe.desk.reportview import get_match_cond, get_filters_cond
	conditions = []
	fields = ["name", "practitioner_name", "mobile_phone"]

	meta = frappe.get_meta("Healthcare Practitioner")
	searchfields = meta.get_search_fields()
	searchfields = searchfields + [f for f in [searchfield or "name", "practitioner_name"] \
			if not f in searchfields]
	fields = fields + [f for f in searchfields if not f in fields]

	fields = ", ".join(fields)
	searchfields = " or ".join([field + " like %(txt)s" for field in searchfields])

	return frappe.db.sql("""select {fields} from `tabHealthcare Practitioner`
		where docstatus < 2
			and ({scond}) and active=1
			{fcond} {mcond}
		order by
			if(locate(%(_txt)s, name), locate(%(_txt)s, name), 99999),
			if(locate(%(_txt)s, practitioner_name), locate(%(_txt)s, practitioner_name), 99999),
			idx desc,
			name, practitioner_name
		limit %(start)s, %(page_len)s""".format(**{
			"fields": fields,
			"scond": searchfields,
			"mcond": get_match_cond(doctype),
			"fcond": get_filters_cond(doctype, filters, conditions).replace('%', '%%'),
		}), {
			'txt': "%%%s%%" % txt,
			'_txt': txt.replace("%", ""),
			'start': start,
			'page_len': page_len
		})

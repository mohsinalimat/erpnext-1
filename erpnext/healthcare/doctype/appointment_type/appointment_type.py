# -*- coding: utf-8 -*-
# Copyright (c) 2015, ESS LLP and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class AppointmentType(Document):
	def validate(self):
		if self.items and self.price_list:
			for item in self.items:
				existing_op_item_price = frappe.db.exists('Item Price', {'item_code': item.op_consulting_charge_item, 'price_list': self.price_list})
				if not existing_op_item_price and item.op_consulting_charge_item and item.op_consulting_charge:
					make_item_price(self.price_list, item.op_consulting_charge_item, item.op_consulting_charge)
				existing_ip_item_price = frappe.db.exists('Item Price', {'item_code': item.inpatient_visit_charge_item, 'price_list': self.price_list})
				if not existing_ip_item_price and item.inpatient_visit_charge_item and item.inpatient_visit_charge:
					make_item_price(self.price_list, item.inpatient_visit_charge_item, item.inpatient_visit_charge)

@frappe.whitelist()
def get_service_item_based_on_department(appointment_type, department):
	item_list = frappe.db.sql(
			"""
				SELECT
					op_consulting_charge_item, inpatient_visit_charge_item, op_consulting_charge, inpatient_visit_charge
				FROM
					`tabAppointment Type Service Item`
				WHERE
					medical_department = %(department)s AND parent = %(appointment_type)s
			""", {'department': department, 'appointment_type': appointment_type}, as_dict=1)

	return item_list

@frappe.whitelist()
def get_department(appointment_type):
	medical_department = frappe.db.sql(
			"""
				SELECT
					medical_department
				FROM
					`tabAppointment Type Service Item`
				WHERE
					parent = %(appointment_type)s
			""", {'appointment_type': appointment_type}, as_dict=1)

	return medical_department

def make_item_price(price_list, item, item_price):
	frappe.get_doc({
		'doctype': 'Item Price',
		'price_list': price_list,
		'item_code': item,
		'price_list_rate': item_price
	}).insert(ignore_permissions=True, ignore_mandatory=True)

from __future__ import unicode_literals
import frappe

def execute():
	if "Healthcare" not in frappe.get_active_domains():
		return
	frappe.db.sql("alter ignore table `tabClinical Procedure` change standard_selling_rate standard_selling_rate decimal(18,6) default '0.0'")
	frappe.reload_doc("healthcare", "doctype", "clinical_procedure")

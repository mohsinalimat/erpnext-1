from __future__ import unicode_literals
import frappe
from frappe import _

def execute():
	if "Healthcare" not in frappe.get_active_domains():
		return

	frappe.reload_doc("healthcare", "doctype", "insurance_claim")
	if frappe.db.has_column("Insurance Claim", 'si_posting_date'):
		for doc in frappe.get_all('Insurance Claim'):
			print("3456789765445678")
			sales_invoice = frappe.db.get_value('Insurance Claim', doc.name, 'sales_invoice')
			if sales_invoice:
				sales_invoice_posting_date = frappe.db.get_value('Sales Invoice', sales_invoice, 'posting_date')
				if sales_invoice_posting_date:
					print("123456789")
					frappe.db.set_value("Insurance Claim", doc.name, 'si_posting_date', sales_invoice_posting_date)

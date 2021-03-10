import frappe

def execute():
	frappe.reload_doc("healthcare", "doctype", "healthcare_insurance_company")
	frappe.reload_doc("healthcare", "doctype", "healthcare_insurance_contract")

	set_healthcare_insurance_company()
	set_healthcare_insurance_contract()



def set_healthcare_insurance_company():
	try:
		insurance_companies = frappe.get_list("Insurance Company", fields=["name", "insurance_company_name", "customer", "insurance_receivable_account", "insurance_rejected_expense_account", "company"])

		frappe.reload_doc("healthcare", "doctype", "healthcare_insurance_company")
		for insurance_company in insurance_companies:
			if insurance_company:
				doc = frappe.new_doc("Healthcare Insurance Company")
				doc.insurance_company_name = insurance_company.insurance_company_name
				doc.customer = insurance_company.customer
				doc.insurance_company_receivable_account = insurance_company.insurance_receivable_account
				doc.rejected_claims_account = insurance_company.insurance_rejected_expense_account
				doc.flags.ignore_validate = True
				doc.save(ignore_permissions=True)
	except frappe.db.TableMissingError:
		frappe.reload_doc("healthcare", "doctype", "healthcare_insurance_company")

def set_healthcare_insurance_contract():
	try:
		insurance_contracts = frappe.get_list("Insurance Contract", fields=["insurance_company", "insurance_company_name", "insurance_company_customer", "is_active", "start_date", "end_date", "price_list"])
		frappe.reload_doc("healthcare", "doctype", "healthcare_insurance_contract")

		for insurance_contract in insurance_contracts:
			if insurance_contract:
				doc = frappe.new_doc("Healthcare Insurance Contract")
				doc.insurance_company = insurance_contract.insurance_company
				doc.insurance_company_name = insurance_contract.insurance_company_name
				doc.insurance_company_customer = insurance_contract.insurance_company_customer
				doc.default_price_list = insurance_contract.price_list
				doc.is_active = insurance_contract.is_active
				doc.start_date = insurance_contract.start_date
				doc.end_date = insurance_contract.end_date
				doc.flags.ignore_validate = True
				doc.save(ignore_permissions=True)
	except frappe.db.TableMissingError:
		frappe.reload_doc("healthcare", "doctype", "healthcare_insurance_contract")

import frappe

def execute():
	return
    frappe.reload_doctype("Appointment Type")
    frappe.reload_doctype("Appointment Type Service Item")

    appointment_type_list = frappe.get_all('Appointment Type', fields=['name'])
    for appointment_type in appointment_type_list:
        appointment_type_doc = frappe.get_doc('Appointment Type', appointment_type.name)
        price_list = frappe.db.get_value('Selling Settings', None, 'selling_price_list')
        appointment_type_doc.price_list = price_list
        department_list = frappe.get_all('Medical Department', fields=["name"])
        for d in department_list:
            if appointment_type_doc:
                service_item = appointment_type_doc.append("items")
                service_item.medical_department = d.name
                service_item.op_consulting_charge_item = appointment_type_doc.op_consulting_charge_item
                service_item.op_consulting_charge = appointment_type_doc.op_consulting_charge
                service_item.inpatient_visit_charge_item = appointment_type_doc.inpatient_visit_charge_item
                service_item.inpatient_visit_charge = appointment_type_doc.inpatient_visit_charge
        appointment_type_doc.save(ignore_permissions=True)

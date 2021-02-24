frappe.listview_settings['Healthcare Insurance Claim'] = {
	get_indicator: function(doc) {
		var colors = {
			'Invoiced': 'green',
			'Approved': 'blue',
			'Pending': 'orange',
			'Rejected': 'red',
			'Cancelled': 'grey',
			'Payment Requested': 'yellow',
			'Payment Approved': 'blue',
			'Payment Received': 'green',
			'Partial Payment Received': 'orange',
			'Payment Rejected': 'red'
		};
		return [__(doc.status), colors[doc.status], 'status,=,' + doc.status];
	}
};
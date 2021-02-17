frappe.listview_settings['Healthcare Insurance Claim'] = {
	get_indicator: function(doc) {
		var colors = {
			'Invoiced': 'green',
			'Approved': 'blue',
			'Pending': 'orange',
            'Rejected': 'red',
			'Cancelled': 'grey',
            'Closed': 'yellow'
		};
		return [__(doc.status), colors[doc.status], 'status,=,' + doc.status];
	}
};
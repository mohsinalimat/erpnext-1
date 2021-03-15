frappe.listview_settings['Healthcare Insurance Subscription'] = {
	add_fields: ["name", "status"],
	get_indicator: function(doc) {
		if(doc.status=="Active"){
			return [__("Active"), "green", "status,=,Active	"];
		}
		if(doc.status=="Expired"){
			return [__("Expired"), "black", "status,=,Expired"];
		}
	},
};

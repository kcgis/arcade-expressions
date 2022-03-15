// Portal connection
var portal = Portal('https://maps.co.kendall.il.us/portal')

// PINs
var pins = FeatureSetByPortalItem(
    portal,
    'da490f45ce954edca8ba4a5cd156564b',
    2,
    ['pin', 'pin_type', 'globalid'],
    false
)

// Filter for retired PINs
var retired_pins = Filter(pins, 'pin_type = 4')

/*
Intermediate dict. We need to create a FeatureSet of all retired PINs in order to retain the parent GUID.
We also want to check if a given PIN was retired on a different, prior document.
*/

var all_pins_dict = {
    fields: [
        {name: 'pin', type: 'esriFieldTypeString'},
        {name: 'doc', type: 'esriFieldTypeString'},
        {name: 'doc_status', type: 'esriFieldTypeInteger'},
        {name: 'latest_review_date', type: 'esriFieldTypeDate'},
        {name: 'latest_review_result', type: 'esriFieldTypeString'},
        {name: 'pin_guid', type: 'esriFieldTypeGUID'}
    ],
    geometryType: '',
    features: []
}

// For each PIN, populate dict

for (var p in retired_pins){
    // Get related doc attributes
    var doc = First(FeatureSetByRelationshipName(p, 'docs'))
    var doc_num = doc['doc_num']
    var doc_status = doc['status']
    
    // Get reviews
    var rvws = FeatureSetByRelationshipName(p, 'tc_review', ['review_type', 'review_result', 'created_date'])

    // Get treasurer reviews only. Set this to '1' to return clerk reviews.
    var t_rvws = Filter(rvws, 'review_type = 0')
    
    // Empty variables
    var latest_rvw_date = Null;
    var latest_rvw_result = Null;
        
    // Check if any treasurer reviews exist, overwrite variables
    If(Count(t_rvws) > 0){
        
        // Sort by date and take most recent, get attributes
        var latest_rvw = First(OrderBy(t_rvws, 'created_date DESC'))
        latest_rvw_date = Number(latest_rvw['created_date'])
        latest_rvw_result = DomainName(latest_rvw, 'review_result')
        
    }
        
    // Add to feature array
    Push(
        all_pins_dict['features'],
        {
            attributes: {
                pin: p['pin'],
                doc: doc_num,
                doc_status: doc_status,
                latest_review_date: latest_rvw_date,
                latest_review_result: latest_rvw_result,
                pin_guid: p['globalid']
            }
        }
    )
}

var all_pins = FeatureSet(Text(all_pins_dict))

// Filtered PINs dict
var filtered_pins_dict = {
    fields: [
        {name: 'pin', type: 'esriFieldTypeString'},
        {name: 'doc', type: 'esriFieldTypeString'},
        {name: 'doc_status', type: 'esriFieldTypeInteger'},
        {name: 'latest_review_date', type: 'esriFieldTypeDate'},
        {name: 'latest_review_result', type: 'esriFieldTypeString'},
        {name: 'pin_guid', type: 'esriFieldTypeGUID'}
    ],
    geometryType: '',
    features: []
}


// Now we take those PINs, sort by doc number, and take the first of each PIN
var ordered_pins = OrderBy(all_pins, 'doc ASC')
var distinct_pins = []

for (var o in ordered_pins){
    var the_pin = o['pin']

    If(!Includes(distinct_pins, the_pin)){
        Push(distinct_pins, the_pin)
        Push(
            filtered_pins_dict['features'],
            {
                attributes: {
                    pin: the_pin,
                    doc: o['doc'],
                    pin_guid: o['pin_guid'],
                    doc_status: o['doc_status'],
                    latest_review_date: When(IsEmpty(o['latest_review_date']), Null, Number(o['latest_review_date'])),
                    latest_review_result: o['latest_review_result']
                }
            }
        )
    }
}

return FeatureSet(Text(filtered_pins_dict))
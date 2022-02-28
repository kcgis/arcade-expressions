// Get portal connection
var portal = Portal('https://maps.co.kendall.il.us/portal')

// Get docs layer
var docs = FeatureSetByPortalItem(
    portal,
    'cabe28ff862e40a49aa4752f2df46d98',
    0,
    ['doc_num', 'doc_type'],
    false
)

// Get PINs table for later
var all_pins = FeatureSetByPortalItem(
    portal,
    'cabe28ff862e40a49aa4752f2df46d98',
    2,
    ['pin', 'pin_type'],
    false
)

// // Function to check pin array; CAN'T USE Any IN CURRENT VERSION
// function AllClear(value){ return value['cleared'] == 1 }

// Output dictionary
var out_dict = {
    fields: [
        {name: 'doc_num',      type: 'esriFieldTypeString'},
        {name: 'doc_type',     type: 'esriFieldTypeString'},
        {name: 'has_review',   type: 'esriFieldTypeInteger'},
        {name: 'needs_devnet', type: 'esriFieldTypeInteger'},
        {name: 'has_devnet',   type: 'esriFieldTypeInteger'},
        {name: 'needs_fabric', type: 'esriFieldTypeInteger'},
        {name: 'has_fabric',   type: 'esriFieldTypeInteger'},
        {name: 'has_qc',       type: 'esriFieldTypeInteger'},
        {name: 'tc_cleared',   type: 'esriFieldTypeInteger'}
    ],
    geometryType: '',
    features: []
}

// List of GIS docs
var gis_docs = [
    'AFFD',
    'ANXA',
    'ANXO',
    'COMD',
    'CORR',
    'MREC',
    'ORDI',
    'PLAT',
    'RESL',
    'MISC',
    'OR',
    'SR'
]

// Iterate over docs
for (var d in docs){

    // Set null vars
    var has_review;
    var needs_devnet;
    var has_devnet;
    var needs_fabric;
    var has_fabric;
    var has_qc;
    var tc_cleared;

    // Get associated reviews, if any
    var rvws = FeatureSetByRelationshipName(d, 'gis_review', ['review_result', 'created_date'])

    // If reviews exist, set flag and check review result, otherwise move on
    if (Count(rvws) > 0){
        has_review = 1

        // Determine if doc is GIS or Assessor
        if (Includes(gis_docs, d['doc_type'])){
            var dtype = 'gis'
        } else {
            var dtype = 'assr'
        }

        // Grab latest review
        var rvw = First(OrderBy(rvws, 'created_date DESC'))['review_result']

        // Devnet is only needed if the review_result is 'split/combo', which is code 2
        if (rvw == 2){
            needs_devnet = 1
            needs_fabric = 1

            // Get PINs associated w/ doc
            var pins = FeatureSetByRelationshipName(d, 'pins', ['pin', 'pin_type'])

            // Retired PINs only
            var rpins = Filter(pins, 'pin_type = 4')

            // Create array of PINs for checking
            var pin_arr = []

            // Iterate over PINs
            for (var pin in rpins){

                // Query PIN table for matching PINs
                var matching_pins = Filter(all_pins, 'pin_type = 4 AND pin = @pin')

                // Iterate over matching PINs and get reviews
                for (var mp in matching_pins){
                    var tc_rvws = FeatureSetByRelationshipName(mp, 'tc_review', ['review_type', 'review_result', 'created_date'])

                    // Check if reviews exist for PIN
                    if (Count(tc_rvws) > 0){

                        // See if clerk and treas said yes w/in the calendar year
                        var clerk = Count(Filter(tc_rvws, `review_type = 1 AND review_result = 1 AND EXTRACT(YEAR FROM created_date) = ${Year(Now())}`)) > 0
                        var treas = Count(Filter(tc_rvws, `review_type = 0 AND review_result = 1 AND EXTRACT(YEAR FROM created_date) = ${Year(Now())}`)) > 0

                        if (clerk && treas){
                            Push(pin_arr, {pin: mp['pin'], cleared: 1})
                        } else {
                            Push(pin_arr, {pin: mp['pin'], cleared: 0})
                        }

                        // Since T/C only review each PIN once, break loop if reviews are found, the rest will be empty
                        break
                    }
                    
                }
            }

            // // Check pin array; CAN'T USE Any IN CURRENT VERSION
            // tc_cleared = Iif(All(pin_arr, AllClear), 1, 0)

            // Check if all pins are cleared
        }

        // Fabric also needed if a GIS doc set to 'good legal'
        if (rvw == 1 && dtype == 'gis'){
            needs_fabric = 1
        }

        // Get associated processing steps, if any
        var proc = FeatureSetByRelationshipName(d, 'gis_processing', ['process_step', 'created_user'])

        // If processing exists, check each type and adjust flags as needed
        if (Count(proc) > 0){
            for (var p in proc){
                if (p['process_step'] == 0){
                    has_devnet = 1
                } else if (p['process_step'] == 1){
                    has_fabric = 1
                } else if (p['process_step'] == 2){
                    has_qc = 1
                }
            }
        }

        // Populate output dictionary
        Push(
            out_dict['features'],
            {
                attributes: {
                    doc_num:      d['doc_num'],
                    doc_type:     d['doc_type'],
                    has_review:   DefaultValue(has_review, 0),
                    needs_devnet: needs_devnet,
                    has_devnet:   DefaultValue(has_devnet, 0),
                    needs_fabric: needs_fabric,
                    has_fabric:   DefaultValue(has_fabric, 0),
                    has_qc:       DefaultValue(has_qc, 0),
                    tc_cleared:   tc_cleared
                }
            }
        )
    } else continue
}

return FeatureSet(Text(out_dict))
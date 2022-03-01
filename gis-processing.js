// Get portal connection
var portal = Portal('https://maps.co.kendall.il.us/portal')

// Get docs layer
var docs = FeatureSetByPortalItem(
    portal,
    'cabe28ff862e40a49aa4752f2df46d98',
    0,
    ['doc_num', 'doc_type', 'globalid', 'status'],
    false
)

// Filter for all non-GIS Review statuses
var fdocs = Filter(docs, 'status <> 3')

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
        {name: 'doc_num',           type: 'esriFieldTypeString'},
        {name: 'doc_type',          type: 'esriFieldTypeString'},
        {name: 'processing_status', type: 'esriFieldTypeString'},
        {name: 'doc_guid',          type: 'esriFieldTypeGUID'},
        {name: 'processor',         type: 'esriFieldTypeString'}
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
for (var d in fdocs){
    
    Console(`Checking doc ${d['doc_num']}`)

    // Set default values; 0 = not needed, 1 = needed, 2 = complete
    var tc = 0;
    var devnet = 0;
    var fabric = 1;
    var qc = 1;
    var processor;

    // Get associated reviews, if any
    var rvws = FeatureSetByRelationshipName(d, 'gis_review', ['review_result', 'created_date'])

    // If reviews exist, set flag and check review result, otherwise move on
    if (Count(rvws) > 0){

        // Determine if doc is GIS or Assessor
        if (Includes(gis_docs, d['doc_type'])){
            var dtype = 'gis'
        } else {
            var dtype = 'assr'
        }
        
        Console(`\tReviews exist. Type: ${dtype}`)

        // Grab latest review
        var rvw = First(OrderBy(rvws, 'created_date DESC'))['review_result']

        // Devnet is only needed if the review_result is 'split/combo', which is code 2
        if (rvw == 2){
            
            Console('\tReview indicates a split/combo. Devnet and Fabric are both needed.')
        
            devnet = 1

            // Get PINs associated w/ doc
            var pins = FeatureSetByRelationshipName(d, 'pins', ['pin', 'pin_type'])

            // Retired PINs only
            var rpins = Filter(pins, 'pin_type = 4')

            // Create array of PINs for checking
            var pin_arr = []

            // Iterate over PINs
            for (var pin in rpins){
                
                Console(`\tChecking TC approval to retire ${pin['pin']}`)

                // Query PIN table for matching PINs
                var matching_pins = Filter(all_pins, `pin_type = 4 AND pin = '${pin['pin']}'`)

                // PINs should exist for all 
                // Iterate over matching PINs and get reviews
                for (var mp in matching_pins){
                    var tc_rvws = FeatureSetByRelationshipName(mp, 'tc_review', ['review_type', 'review_result', 'created_date'])

                    // Check if reviews exist for PIN
                    if (Count(tc_rvws) > 0){

                        // See if clerk and treas said yes w/in the calendar year
                        var clerk = Count(Filter(tc_rvws, `review_type = 1 AND review_result = 1 AND EXTRACT(YEAR FROM created_date) = ${Year(Now())}`)) > 0
                        var treas = Count(Filter(tc_rvws, `review_type = 0 AND review_result = 1 AND EXTRACT(YEAR FROM created_date) = ${Year(Now())}`)) > 0

                        if (clerk && treas){
                            Push(pin_arr, 1)
                        } else {
                            Push(pin_arr, 0)
                        }

                        // Since T/C only review each PIN once, break loop if reviews are found, the rest will be empty
                        break
                    }
                    
                }
            }

            // Check if all pins are cleared, move to next step
            tc = Iif(Count(pin_arr) > 0 && Count(pin_arr) == Sum(pin_arr), 2, 1)
        }

        // Fabric also needed if a GIS doc set to 'good legal'
        else if (rvw == 1 && dtype == 'gis'){
            Console('\tReview and doc type indicate fabric work is needed.')
        }
        
        else {
            Console('\tNo GIS processing is required. Moving to next.')
            continue
        }

        // Get associated processing steps, if any
        var proc = FeatureSetByRelationshipName(d, 'gis_processing', ['process_step', 'created_user'])

        // If processing exists, check each type and adjust flags as needed
        if (Count(proc) > 0){
            for (var p in proc){
                if (p['process_step'] == 0){
                    devnet = 2
                } else if (p['process_step'] == 1){
                    fabric = 2
                    processor = p['created_user']
                } else if (p['process_step'] == 2){
                    qc = 2
                }
            }
        }

        // Determine processing status based on flags
        var processing_status = When(
            qc == 2, 'Done',
            fabric == 2, 'Needs QC',
            devnet == 2 || devnet == 0, 'Needs Fabric',
            tc == 2, 'Needs Devnet',
            'Pending T/C'
        )

        // Populate output dictionary
        Push(
            out_dict['features'],
            {
                attributes: {
                    doc_num:           d['doc_num'],
                    doc_type:          d['doc_type'],
                    processing_status: processing_status,
                    doc_guid:          d['globalid'],
                    processor:         processor
                }
            }
        )
    } else {
        Console('\tDoc has no reviews. Moving to next.')
        continue
    }
}

return FeatureSet(Text(out_dict))
/*
This expression will return all documents needing Quality Checks.

Criteria:
    - Fabric processing exists
    - Fabric processing was not done by current user
    - QC has not been done yet
*/

var portal = Portal('https://maps.co.kendall.il.us/portal');

// Get current username to filter docs
var curr_user = GetUser(portal)['username']

// Get processing layer, filter out current user
var procs = Filter(
    FeatureSetByPortalItem(
        portal,
        'da490f45ce954edca8ba4a5cd156564b',
        4,
        ['doc_guid', 'process_step', 'created_user'],
        false
    ),
    `process_step = 1 AND created_user <> '${curr_user}'`
);

// Output dict
var out_dict = {
    fields: [
        {name: 'doc_num', type: 'esriFieldTypeString'},
        {name: 'doc_guid', type: 'esriFieldTypeGUID'},
        {name: 'created_user', type: 'esriFieldTypeString'}
    ],
    geometryType: '',
    features: []
}

// For each processing item, check if parent doc has any QC already

for ( var p in procs){

    // Get parent doc
    var doc = First(FeatureSetByRelationshipName(p, 'docs', ['doc_num'], false))

    Console(`Checking for QC on ${doc['doc_num']}`)

    // Get other processing steps
    var dprocs = Filter(
        FeatureSetByRelationshipName(doc, 'gis_processing', ['process_step']),
        'process_step = 2'
    )
    
    // If no QC exists, push to output dict
    if (Count(dprocs) == 0){
        Push(
            out_dict['features'],
            {
                attributes: {
                    doc_num: doc['doc_num'],
                    doc_guid: p['doc_guid'],
                    created_users: p['created_user']
                }
            }
        )
    }
}

return FeatureSet(Text(out_dict))

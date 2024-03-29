/* GIS WORKFLOW DATA EXPRESSION
    This Arcade expression cobbles together a single workable layer from the Recorded Document Workflow's tables.
    It can get a bit complex at times, but every effort has been made to explain the code via comments.
    Additionally, complex procedures are separated out into their own custom functions so that the main body of the expression is easier to follow.
*/

/* SETUP
    Before the expression gets rolling, a number of globals need to be created.
        portal: the GIS Portal
        docs: the document layer as a FeatureSet, filtered to exclude Assessor Hold docs and Open docs that Assessor has not reviewed yet.
        tc: the Treasurer and Clerk review table. T/C review each PIN only once, so the PINs on a given doc only need be checked against this FeatureSet
        gis_docs: doc types that come straight to GIS, and do not need to be in GIS Review
        out_dict: the dictionary that will hold our output features
*/

// Get portal connection
var portal = Portal('https://maps.co.kendall.il.us/portal');

// List of GIS docs
var gis_docs = [
    'ANXA',
    'ANXO',
    'COMD',
    'CORR',
    'MREC',
    'ORDI',
    'PLAT',
    'RESL',
    'ORD',
    'DEC',
    'SUBN',
    'CONS',
    'NOT',
    'OR',
    'SR',
    'DED'
];

// Get docs layer
var docs = Filter(
    FeatureSetByPortalItem(
        portal,
        'da490f45ce954edca8ba4a5cd156564b',
        0,
        ['doc_num', 'doc_type', 'globalid', 'status'],
        false
    ),
    `status <> 2 AND (status <> 0 OR doc_type IN('${Concatenate(gis_docs, "','")}')) AND status <> 6` 
    // append "AND doc_num LIKE '202200008%'" or similar for testing against a subset
);

// Get tc table
var tc = FeatureSetByPortalItem(
    portal,
    'da490f45ce954edca8ba4a5cd156564b',
    5,
    [
        'pin',
        'pin_status'
    ],
    false
);

var thisyear = Year(Today())

// ItemIDs of survey forms
var review_form = 'b6c2f164b6e646c099850e8a974ad194';
var process_form = '2ed60a8996484596bd821f7b5807a358';

// Output dictionary
var out_dict = {
    fields: [
        {name: 'doc_num',           type: 'esriFieldTypeString'},
        {name: 'doc_type',          type: 'esriFieldTypeString'},
        {name: 'processing_status', type: 'esriFieldTypeString'},
        {name: 'doc_guid',          type: 'esriFieldTypeGUID'},
        {name: 'processor',         type: 'esriFieldTypeString'},
        {name: 'form_id',           type: 'esriFieldTypeString'},
        {name: 'process_step',      type: 'esriFieldTypeInteger'},
        {name: 'warnings',          type: 'esriFieldTypeString'}
    ],
    geometryType: '',
    features: []
};

/* PINcheck FUNCTION
    When a document will retire PINs due to a split or combo, all PINs need to be cleared by the Treasurer and Clerk before they can be officially retired.
    Given a FeatureSet of retired PINs, this function checks the T/C Review table to see if the Treasurer and Clerk have reviewed the PIN within the current calendar year.
    Parameters:
        retired_pins (FeatureSet)
    Returns:
        boolean
*/

function PINcheck(retired_pins){

    // Create array of PINs for checking
    var pin_arr = [];
    var pin_list = [];

    // Iterate over PINs and build a query string
    // If pin was created same year, push to array, otherwise check for reviews
    for (var pin in retired_pins){
        Push(pin_list, pin['pin'])
    }

        // Query PIN table for matching PINs
        var matching_pins = Filter(all_pins, `pin_type = 4 AND pin = '${pin['pin']}'`)

    // Query tc table for matching pins, filtered to be same-year approved
    var approved_pins = Filter(tc, `pin IN(${pin_str})
        AND t_review = 'Y'
        AND c_review = 'Y'
        AND EXTRACT(YEAR FROM t_last_review_date) = ${thisyear}
        AND EXTRACT(YEAR FROM c_last_review_date) = ${thisyear}
        `)

    var ap_arr = [];

    // Push approved PINs into array
    for (var ap in approved_pins){
        Push(ap_arr, ap['pin'])
    }

    // Iterate over retired PINs to look for matches
    for (var pin in retired_pins){
        if (pin['pin_year'] == Year(Now()) || IndexOf(ap_arr, pin['pin']) != -1) {
            Push(pin_arr, true)
            Console(`\t${pin['pin']} OK`)
        } else {
            Push(pin_arr, false)
            Console(`\t${pin['pin']} NOT CLEARED`)
        }
    }

    // Return T/C clearance
    return All(pin_arr, Boolean)
};

/* PushFeature FUNCTION
    As we move through the documents list, we will be using Push to add our features to the output array.
    The fields in the output never change, just their values. Rather than write out an entire feature dictionary every time we need to push a feature, we will use this function.
    Parameters:
        These follow the fields of the output dictionary.
*/

function PushFeature(doc_num, doc_type, processing_status, guid, processor, form_id, process_step, warnings){

    Push(
        out_dict['features'],
        {
            attributes: {
                doc_num:           doc_num,
                doc_type:          doc_type,
                processing_status: processing_status,
                doc_guid:          guid,
                processor:         processor,
                form_id:           form_id,
                process_step:      process_step,
                warnings:          warnings
            }
        }
    )
};

/* CriteriaString FUNCTION
    When a document enters a given status, it is helpful to have a list of items which need to be done.
    The dashboard itself can split this string into multiple lines, but it cannot parse a dictionary.
    That means we've got to get our string 90% of the way here.
    Parameters:
        criteria (array of dictionaries)
    Returns:
        pipe (|) delimited string
*/

function CriteriaString(criteria){

    var c_arr = [];

    for (var c in criteria){
        var stat = Iif(criteria[c]['status'], '✔️', '❌')

        Push(c_arr, `${stat} ${criteria[c]['criteria']}`)
    }

    return Concatenate(c_arr, '|')
}

/* MAIN BODY
    For each recorded document, it will move through the following steps on the GIS side:
        1. GIS Review
        2. Devnet
        3. Fabric
        4. QC
    Each of these steps requires the document and its related tables to be updated in some way.
    This expression uses calculated "flags" to determine what steps are necessary, and whether the criteria have been met or not.
    To facilitate these checks, as many flags as possible are determined at the top of the loop.
*/

for (var d in docs){
    
    Console(`Checking doc ${d['doc_num']}`);

    // Get associated reviews, if any
    var rvws = FeatureSetByRelationshipName(d, 'gis_review', ['review_result', 'created_date']);
    var rvw_count = Count(rvws);
    var rvw;

    // Get associated PINs and specific type counts, if any
    var pins = FeatureSetByRelationshipName(d, 'pins', ['pin', 'pin_type', 'pin_year']);
    var npin_count = Count(Filter(pins, 'pin_type IN(1,2,5)'));
    var rpins = Filter(pins, `pin_type = 4 AND (pin_year IS NULL OR pin_year < ${Year(Now())})`);
    var rpin_count = Count(rpins);

    // Get associated processing and type counts
    var proc = FeatureSetByRelationshipName(d, 'gis_processing', ['process_step', 'created_user'])
    var proc_devnet_count = Count(Filter(proc, 'process_step = 0'))
    var proc_fabric_count = Count(Filter(proc, 'process_step = 1'))
    var proc_qc_count = Count(Filter(proc, 'process_step = 2'))

    // Determine doc type
    var dtype = Iif(Includes(gis_docs, d['doc_type']), 'gis', 'assr')

    // Empty warning string and criteria array
    var criteria;
    var warning;

    /* GIS REVIEW
        Conditions:
            status = 'GIS Review'
            OR
            (status = 'Open' and doctype = 'gis')
        Completion criteria
            - Document status must be updated
            - Document must have an associated review
            - If review == 'split/combo', at least one retired PIN needs to be added
        Because our docs FeatureSet has already been filtered, anything *without* a review should be on the GIS Review list until it meets all criteria.
    */

    // Review Flags
    var review_done;
    var review_status_change;
    var review_retiredpins;

    // First check for reviews. Get latest review result if any.
    if (rvw_count == 0){
        
        Console('\tNo reviews on doc yet.');
        review_done = false;
    
    } else {

        review_done = true;
        rvw = First(OrderBy(rvws, 'created_date DESC'))['review_result']

    }

    // If latest review was a split/combo, see if retired PINs exist. Default to true if not split/combo.
    review_retiredpins = When(
        rvw == 2 && rpin_count > 0, true,
        rvw == 2, false,
        true
    )

    // Now check if status has been updated
    review_status_change = Iif(d['status'] == 3 || (d['status'] == 0 && dtype == 'gis'), false, true )

    // Now we check the review flags. If all three are met, proceed, otherwise push the feature to Review.
    if (review_done && review_status_change && review_retiredpins){

        Console('\tDoc meets all criteria. Moving to Devnet.')

    } else {
        
        criteria = [
            {criteria: 'Document Reviewed', status: review_done},
            {criteria: 'Retired PINs Added / Not Needed', status: review_retiredpins},
            {criteria: 'Status Updated', status: review_status_change}
        ]

        warning = CriteriaString(criteria)
        
        Console(`\t${warning}`)

        PushFeature(
            d['doc_num'],
            dtype,
            'Review',
            d['globalid'],
            null,
            review_form,
            -1,
            warning
        )

        continue

    }

    /* DEVNET
        Conditions:
            latest review = 'split/combo'
            AND
            PINs are cleared by T/C
        Completion criteria
            - Processing entry added
            - At least one new / remainder / placeholder PIN added
        Some docs entering DEVNET will not actually need this step, but we'll pass them through to be sure.
        Anything which falls into this bucket will *also* require the Treasurer and Clerk to sign off on the retired PINs.
        As part of the DEVNET stage of this expression, there will be a subroutine which can route documents to 'Pending T/C'.
    */

    // Devnet Flags
    var devnet_done;
    var devnet_newpins;
    var tc_cleared;
    
    /* First, we'll check if Devnet is even necessary for this document. Documents with a 'good legal' review do not.
    Additionally, 'good legal' docs only need to pass through if they are GIS documents. Assessor docs can be dropped at this point entirely. */
    if (rvw != 2){

        if (dtype == 'assr'){
        
            Console('\tDoc needs no further action from GIS.')
            continue

        } else {

            devnet_done = true;
            devnet_newpins = true;
            tc_cleared = true;

        }

    // If devnet is required, we will assign flags appropriately
    } else {

        devnet_done = Iif(proc_devnet_count > 0, true, false)
        devnet_newpins = Iif(npin_count > 0, true, false)
        tc_cleared = PINcheck(rpins)
    }

    /* Now we check all the flags. If tc has not cleared it, immediately send to Pending T/C.
    If all criteria met, move to Fabric. Otherwise, push feature to Devnet and log messages. */

    if (!tc_cleared){

        Console('\tWaiting for T/C Clearance.')

        PushFeature(
            d['doc_num'],
            dtype,
            'Pending T/C',
            d['globalid'],
            null,
            process_form,
            0,
            null
        )

        continue

    } else if (devnet_done && devnet_newpins && tc_cleared){

        Console('\tDoc meets all criteria. Moving to Fabric.')

    } else {

        criteria = [
            {criteria: 'Devnet Processed', status: devnet_done},
            {criteria: 'New / Remainder / Placeholder PIN(s) Added', status: devnet_newpins}
        ]

        warning = CriteriaString(criteria)
        
        Console(`\t${warning}`)

        PushFeature(
            d['doc_num'],
            dtype,
            'Devnet',
            d['globalid'],
            null,
            process_form,
            0,
            warning
        )

        continue

    }

    /* FABRIC
        Conditions:
            Status = 'Processing'
            AND
            Devnet processing completed
        Completion criteria
            - Processing entry added
            - Status set to 'Assessor Review' or 'Closed', depending on doc type
        If a document has gotten to this point, it needs Fabric processing.
    */

    // Fabric flags
    var fabric_done = Iif(proc_fabric_count > 0, true, false)
    var fabric_status_change = Iif(d['status'] != 5, true, false)

    // If all criteria met, move into QC. Otherwise, push feature to Fabric
    if ((fabric_done && fabric_status_change) || rvw == 3){

        Console('\tDoc meets all criteria. No further processing required.')

    } else {

        criteria = [
            {criteria: 'Fabric Processed', status: fabric_done},
            {criteria: 'Status Updated', status: fabric_status_change}
        ]

        warning = CriteriaString(criteria)

        Console(`\t${warning}`)

        PushFeature(
            d['doc_num'],
            dtype,
            'Fabric',
            d['globalid'],
            null,
            process_form,
            1,
            warning
        )

        continue

    }
}

return FeatureSet(Text(out_dict))

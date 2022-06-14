var portal = Portal('https://maps.co.kendall.il.us/portal')

// Get hold docs
var fs = Filter(
        FeatureSetByPortalItem(
        portal,
        'da490f45ce954edca8ba4a5cd156564b',
        0,
        ['doc_num', 'globalid'],
        false
    ),
    'status = 2'
)

var out_dict = {
    fields: [
        {name: 'doc_num', type: 'esriFieldTypeString'},
        {name: 'days_since', type: 'esriFieldTypeInteger'},
        {name: 'dur_string', type: 'esriFieldTypeString'},
        {name: 'doc_id', type: 'esriFieldTypeGUID'}
    ],
    geometryType: '',
    features: []
}

for (var f in fs){
    var days_since;
    var dur_string;

    // get followups
    var fups = FeatureSetByRelationshipName(f, 'followups', ['followup_date'])

    if (Count(fups) > 0){
        var fup = First(
            OrderBy(
                FeatureSetByRelationshipName(f, 'followups', ['followup_date']),
                'followup_date DESC'
            )
        )

        days_since = Floor(DateDiff(Now(), fup['followup_date'], 'days'))

        dur_string = `Last followed up ${days_since} days ago.`
    }

    Push(
        out_dict['features'],
        {
            attributes: {
                doc_num: f['doc_num'],
                days_since: DefaultValue(days_since, null),
                dur_string: DefaultValue(dur_string, 'Not followed up yet.'),
                doc_id: f['globalid']
            }
        }
    )
}

return FeatureSet(Text(out_dict))
// Gets the latest (if any) inspection based on the current feature's `globalid`

var portal = Portal('https://maps.co.kendall.il.us/portal')

var fs = FeatureSetByPortalItem(
    portal,
    '7bfa2acabe604e12a7c165a613fe7b4f',
    0,
    [
        'condition',
        'asset_guid',
        'interaction_type',
        'created_date',
        'lifespan',
        'condition',
        'maintenance_needs',
        'notes'
    ],
    false
)

var filt_fs = Filter(
    OrderBy(fs, 'created_date DESC'),
    `asset_guid = '${$feature.globalid}' and interaction_type = 'I'`
)

if (Count(filt_fs) < 1){
    return 'No Inspections Yet'
} else {
    var feat = First(filt_fs)
    var condition = Decode(
        feat['condition'],
        1, 'Very Poor',
        2, 'Poor',
        3, 'Adequate',
        4, 'Good',
        5, 'Excellent',
        '')
    
    return `Date: ${Text(feat['created_date'], 'DD-MMM-YYYY')}
Condition: ${condition}
Estimated Lifespan: ${feat['lifespan']}
${feat['notes']}`
}
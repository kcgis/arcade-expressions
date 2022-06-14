// gets the latest (if any) maintenance based on the current feature's globalid
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
        'notes'
    ],
    false
)

var filt_fs = Filter(
    OrderBy(fs, 'created_date DESC'),
    `asset_guid = '${$feature.globalid}' and interaction_type = 'M'`
)

if (Count(filt_fs) < 1){
    return 'No Maintenance Yet'
} else {
    var feat = First(filt_fs)
    
    return `Date: ${Text(feat['created_date'], 'DD-MMM-YYYY')}
${feat['notes']}`
}
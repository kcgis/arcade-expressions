// returns a unique, human-readable string that identifies the feature

// this list will vary depending on the layer
var ids = [
    `Amenity ${$feature.objectid}`,
    DomainName($feature,"amenity_type"),
    $feature.name
]

var cleaned = []

for (var i in ids){
    if (!IsEmpty(ids[i])){
        Push(cleaned, ids[i])
    }
}

Concatenate(cleaned, ', ')
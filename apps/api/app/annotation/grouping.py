"""One review per overlapping play, scoped by the caller to one demo/player."""
from copy import deepcopy

GROUPING_VERSION = 'overlapping-plays-v1'
MAX_GROUP_SECONDS = 60


def review_key(footage, finding=None):
    return footage.get('reviewKey') or (finding or footage['finding'])['id']


def group_moments(moments):
    """Merge padded windows, without chaining a whole round into one clip.

    A manually requested window longer than the cap is preserved, and may absorb
    contained windows. Grouping never trims a finding's requested context.
    """
    groups = []
    for moment in sorted(moments, key=lambda m: (m['finding']['round'], m['startTick'], m['finding']['t'], m['finding']['id'])):
        previous = groups[-1] if groups else None
        duration = moment['end'] - moment['start']
        if (previous and previous['finding']['round'] == moment['finding']['round']
                and moment['startTick'] <= previous['endTick']
                and max(previous['end'], moment['end']) - previous['start']
                <= max(MAX_GROUP_SECONDS, previous['end'] - previous['start'], duration)):
            previous['end'] = max(previous['end'], moment['end'])
            previous['endTick'] = max(previous['endTick'], moment['endTick'])
            previous['findings'].append(moment['finding'])
        else:
            groups.append({**deepcopy(moment), 'findings': [moment['finding']]})
    for group in groups:
        group['findings'].sort(key=lambda f: (f['t'], f['id']))
        group['finding'] = group['findings'][0]  # Legacy readers retain a real finding.
        group['anchor'] = group['finding']['t']
        group['reviewKey'] = '+'.join(sorted(f['id'] for f in group['findings']))
        group['findingCount'] = len(group['findings'])
    return groups

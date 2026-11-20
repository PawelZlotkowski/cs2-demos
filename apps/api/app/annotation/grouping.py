"""One review per overlapping play, scoped by the caller to one demo/player."""
from copy import deepcopy

GROUPING_VERSION = 'overlapping-plays-v2'


def review_key(footage, finding=None):
    return footage.get('reviewKey') or (finding or footage['finding'])['id']


def group_moments(moments):
    """Union overlapping contexts within a round, retaining all evidence.

    A length cap can split a connected action into overlapping clips. Prefer a
    longer review to showing that action twice; split only at real gaps.
    """
    groups = []
    for moment in sorted(moments, key=lambda m: (m['finding']['round'], m['startTick'], m['finding']['t'], m['finding']['id'])):
        previous = groups[-1] if groups else None
        if (previous and previous['finding']['round'] == moment['finding']['round']
                and moment['startTick'] <= previous['endTick']):
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

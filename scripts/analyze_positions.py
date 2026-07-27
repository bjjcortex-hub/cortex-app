import json
from collections import defaultdict

with open('scripts/positions_raw.json', encoding='utf-8') as f:
    data = json.load(f)

# Build path -> external_id map
path_to_ext = {}
for n in data:
    raw = n.get('raw') or {}
    path = raw.get('path', '')
    if path:
        path_to_ext[path] = n['external_id']

# Build tree grouped by root
tree = defaultdict(list)
for n in data:
    raw = n.get('raw') or {}
    path = raw.get('path', '')
    if not path:
        continue
    root = path.split('/')[0]
    tree[root].append((path, n))

issues = []
for root in sorted(tree.keys()):
    entries = sorted(tree[root], key=lambda x: x[0])
    print(f'[{root}]')
    for path, n in entries:
        parts = path.split('/')
        ext = n['external_id']
        parent_ext = n.get('parent_external_id')
        depth = len(parts)
        indent = '  ' * (depth - 1)
        if depth == 1:
            status = '(root)'
        elif parent_ext:
            status = f'parent={parent_ext}'
        else:
            status = 'SEM_PARENT'
        print(f'{indent}  - {parts[-1]}  [{ext}]  {status}')
        if depth > 1 and not parent_ext:
            expected_path = '/'.join(parts[:-1])
            expected_ext = path_to_ext.get(expected_path)
            issues.append({
                'ext': ext,
                'path': path,
                'expected_parent_ext': expected_ext,
                'expected_parent_path': expected_path,
            })
    print()

print(f'=== {len(issues)} nos SEM parent_external_id (deveriam ter) ===')
for i in issues:
    fix = i['expected_parent_ext'] or 'SEM_CORRESPONDENCIA'
    print(f'  {i["ext"]:40s} -> parent: {fix:35s}  (path: {i["path"]})')

no_match = [i for i in issues if not i['expected_parent_ext']]
print(f'\n{len(no_match)} sem correspondencia de path:')
for i in no_match:
    print(f'  {i["ext"]}  path: {i["path"]}  pai esperado: {i["expected_parent_path"]}')

"""Audit and synchronize only the two NEW SMALL assets, preserving other work."""
import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import rhino3dm as r

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / 'assets/models/plugs'
REPORT = ROOT / 'outputs/new-small-20261104'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def breps(path):
    return [o.Geometry for o in r.File3dm.Read(str(path)).Objects if isinstance(o.Geometry, r.Brep)]


def samples(geometry):
    result = []
    for face in geometry.Faces:
        u, v = face.Domain(0), face.Domain(1)
        for a in (.1, .5, .9):
            for b in (.1, .5, .9):
                result.append(face.PointAt(u.T0+a*(u.T1-u.T0), v.T0+b*(v.T1-v.T0)))
    return result


def difference(a, b):
    assert len(a.Faces) == len(b.Faces) and len(a.Edges) == len(b.Edges)
    return max(x.DistanceTo(y) for x, y in zip(samples(a), samples(b)))


def main(apply):
    manifest = json.loads((MODELS / 'model-source-manifest.json').read_text(encoding='utf-8'))
    integrity_path = MODELS / 'model-integrity.json'
    integrity = json.loads(integrity_path.read_text(encoding='utf-8'))
    entries = [entry for entry in manifest['models'] if entry['modelId'].startswith('plug-new-small-')]
    assert len(entries) == 2
    before = {entry['target']: sha(MODELS / entry['target']) for entry in manifest['models']}
    REPORT.mkdir(parents=True, exist_ok=True)
    reports = []
    for entry in entries:
        src = Path(manifest['sourceRoot']) / entry['source']
        target = MODELS / entry['target']
        backup = REPORT / 'avant-mise-a-jour' / entry['target']
        previous = backup if backup.exists() else target
        old, new = breps(previous), breps(src)
        assert len(old) == len(new) == 2
        old_metal = next(g for g in old if len(g.Faces) == 6)
        new_metal = next(g for g in new if len(g.Faces) == 6)
        old_stone = next(g for g in old if g is not old_metal)
        new_stone = next(g for g in new if g is not new_metal)
        stone_error = difference(old_stone, new_stone)
        assert stone_error < 1e-8, ('Ornament changed', entry['modelId'], stone_error)
        render_meshes = [face.GetMesh(r.MeshType.Render) for face in new_metal.Faces]
        assert all(mesh is not None and len(mesh.Vertices) > 0 for mesh in render_meshes)
        report = dict(entry, source_sha256=sha(src), previous_sha256=sha(previous),
                      stone_max_error_mm=stone_error, metal_max_parametric_sample_shift_mm=difference(old_metal, new_metal),
                      metal_render_vertices=sum(len(mesh.Vertices) for mesh in render_meshes), comparisons=[])
        # Stand-up mapping used by the native NURBS comparison exporter.
        source_metal = new_metal.Duplicate()
        source_metal.Transform(r.Transform.Rotation(math.pi/2, r.Vector3d(0,0,1), r.Point3d(0,0,0)))
        source_metal.Transform(r.Transform.Rotation(math.pi/2, r.Vector3d(1,0,0), r.Point3d(0,0,0)))
        folder = ROOT / 'outputs/Comparatifs Rhino NURBS 2026-10-23'
        for path in folder.glob('*.3dm'):
            if not path.name.startswith(('07-', '08-', 'PLUGS ')):
                continue
            file = r.File3dm.Read(str(path))
            for obj in file.Objects:
                if obj.Attributes.GetUserString('RosebudsModelId') != entry['modelId'] or not isinstance(obj.Geometry, r.Brep) or len(obj.Geometry.Faces) != 6:
                    continue
                candidate = source_metal.Duplicate()
                theta = float(obj.Attributes.GetUserString('ComparisonAngleRad') or '0')
                candidate.Transform(r.Transform.Rotation(-theta, r.Vector3d(0,0,1), r.Point3d(0,0,0)))
                p, q = samples(candidate)[0], samples(obj.Geometry)[0]
                candidate.Transform(r.Transform.Translation(q.X-p.X, q.Y-p.Y, q.Z-p.Z))
                error = difference(candidate, obj.Geometry)
                assert error < 1e-7, ('Comparison needs update', path.name, error)
                report['comparisons'].append(dict(file=path.name, metal_matches_source=True, max_error_mm=error))
        if apply and sha(src) != sha(target):
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                shutil.copy2(target, backup)
            shutil.copy2(src, target)
            assert sha(src) == sha(target)
        for record in integrity['models']:
            if record['modelId'] == entry['modelId']:
                record['bytes'] = target.stat().st_size
                record['sha256'] = sha(target)
        reports.append(report)
    assert all(sha(MODELS / path) == digest for path, digest in before.items() if not path.startswith('new-small/'))
    if apply:
        integrity['generatedFor'] = 'v0.11-260930'
        integrity.setdefault('assetRevisions', {})['new-small'] = '20261104-new-small-v11'
        integrity_path.write_text(json.dumps(integrity, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    (REPORT / 'audit.json').write_text(json.dumps({'applied':apply,'models':reports}, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(reports, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--apply',action='store_true')
    main(parser.parse_args().apply)

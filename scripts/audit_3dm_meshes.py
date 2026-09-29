import argparse
import json
from pathlib import Path

import rhino3dm


def geometry_metrics(path: Path) -> dict:
    document = rhino3dm.File3dm.Read(str(path))
    if document is None:
        raise RuntimeError(f"Lecture Rhino impossible: {path}")

    metrics = {
        "objects": len(document.Objects),
        "meshes": 0,
        "breps": 0,
        "meshVertices": 0,
        "meshFaces": 0,
        "brepFaces": 0,
        "renderMeshes": 0,
        "renderMeshVertices": 0,
        "renderMeshFaces": 0,
    }
    for item in document.Objects:
        geometry = item.Geometry
        if isinstance(geometry, rhino3dm.Mesh):
            metrics["meshes"] += 1
            metrics["meshVertices"] += len(geometry.Vertices)
            metrics["meshFaces"] += len(geometry.Faces)
        elif isinstance(geometry, rhino3dm.Brep):
            metrics["breps"] += 1
            metrics["brepFaces"] += len(geometry.Faces)
            for face in geometry.Faces:
                render_mesh = face.GetMesh(rhino3dm.MeshType.Render)
                if render_mesh is None:
                    continue
                metrics["renderMeshes"] += 1
                metrics["renderMeshVertices"] += len(render_mesh.Vertices)
                metrics["renderMeshFaces"] += len(render_mesh.Faces)
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit comparatif des modèles 3DM Rosebuds.")
    parser.add_argument("--manifest", default="assets/models/plugs/model-source-manifest.json")
    parser.add_argument("--output", default=".tmp-3dm-mesh-audit.json")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    manifest = json.loads((root / args.manifest).read_text(encoding="utf-8"))
    source_root = Path(manifest["sourceRoot"])
    target_root = root / "assets/models/plugs"
    rows = []
    for entry in manifest["models"]:
        source_path = source_root / Path(entry["source"])
        target_path = target_root / Path(entry["target"])
        rows.append(
            {
                **entry,
                "sourceMetrics": geometry_metrics(source_path),
                "currentTargetMetrics": geometry_metrics(target_path),
            }
        )

    output = root / args.output
    output.write_text(json.dumps({"models": rows}, indent=2, ensure_ascii=False), encoding="utf-8")
    changed_meshes = sum(
        row["sourceMetrics"]["renderMeshVertices"] != row["currentTargetMetrics"]["renderMeshVertices"]
        or row["sourceMetrics"]["renderMeshFaces"] != row["currentTargetMetrics"]["renderMeshFaces"]
        for row in rows
    )
    print(f"Audit géométrique écrit dans {output}")
    print(f"{len(rows)} modèles lus; {changed_meshes} ont une tessellation maillée différente.")


if __name__ == "__main__":
    main()

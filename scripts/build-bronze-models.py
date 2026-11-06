import argparse
from pathlib import Path

import rhino3dm


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrait l'ornement bronze de référence dans un fichier Rhino réutilisable.")
    parser.add_argument("--bronze", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--reference-diameter", type=float, default=26.8)
    parser.add_argument("--name", default="Keyring")
    args = parser.parse_args()

    bronze_document = rhino3dm.File3dm.Read(str(args.bronze))
    if bronze_document is None:
        raise RuntimeError("Le document Rhino bronze n'a pas pu être lu.")

    layers = {layer.Id: layer for layer in bronze_document.Layers}

    def visible_layer(layer):
        while layer is not None:
            if not layer.Visible:
                return False
            layer = layers.get(layer.ParentLayerId)
        return True

    bronze_geometries = [
        item.Geometry for item in bronze_document.Objects
        if isinstance(item.Geometry, rhino3dm.Mesh) and item.Geometry.IsClosed
        and item.Attributes.Visible and visible_layer(bronze_document.Layers[item.Attributes.LayerIndex])
    ]
    if len(bronze_geometries) != 1:
        raise RuntimeError(f"L'ornement doit contenir exactement un maillage exploitable, trouvé : {len(bronze_geometries)}.")

    output = rhino3dm.File3dm()
    output.Settings.ModelUnitSystem = bronze_document.Settings.ModelUnitSystem
    bronze_attributes = rhino3dm.ObjectAttributes()
    bronze_attributes.Name = f"Bronze {args.name} reference {args.reference_diameter:g} mm"
    output.Objects.AddMesh(bronze_geometries[0], bronze_attributes)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if not output.Write(str(args.output), 8):
        raise RuntimeError(f"Écriture Rhino impossible : {args.output}")
    print(f"Ornement bronze extrait : {args.output}")


if __name__ == "__main__":
    main()

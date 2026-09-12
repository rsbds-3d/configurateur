import { Matrix3, Matrix4, Vector3 } from "../vendor/three.module.js";

export function pointInPlacementFrame(point, initialFrame, currentFrame) {
  return point.clone().applyMatrix4(new Matrix4().copy(currentFrame).invert()).applyMatrix4(initialFrame);
}

export function placementInWorld(placement, initialFrame, currentFrame) {
  const transform = new Matrix4().copy(currentFrame).multiply(new Matrix4().copy(initialFrame).invert());
  const linear = new Matrix3().setFromMatrix4(transform);
  const scaleAlong = (axis) => axis.clone().applyMatrix3(linear).length();
  return {
    ...placement,
    center: placement.center.clone().applyMatrix4(transform),
    axis: placement.axis.clone().transformDirection(transform),
    heightAxis: placement.heightAxis.clone().transformDirection(transform),
    normal: placement.normal.clone().transformDirection(transform),
    size: new Vector3(
      placement.size.x * scaleAlong(placement.axis),
      placement.size.y * scaleAlong(placement.heightAxis),
      placement.size.z * scaleAlong(placement.normal),
    ),
  };
}

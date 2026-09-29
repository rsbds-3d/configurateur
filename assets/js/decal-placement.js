import { Matrix3, Matrix4, Vector3 } from "../vendor/three.module.js";

export function sampleAxialProfileRadius(profile, axialT, fallbackRadius = 0) {
  if (!Array.isArray(profile) || profile.length === 0) return fallbackRadius;
  if (profile.length === 1 || axialT <= profile[0].t) return profile[0].radius;
  const last = profile[profile.length - 1];
  if (axialT >= last.t) return last.radius;

  for (let index = 1; index < profile.length; index += 1) {
    const upper = profile[index];
    if (axialT > upper.t) continue;
    const lower = profile[index - 1];
    const span = Math.max(upper.t - lower.t, 1e-8);
    const ratio = Math.min(Math.max((axialT - lower.t) / span, 0), 1);
    return lower.radius + (upper.radius - lower.radius) * ratio;
  }

  return last.radius;
}

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

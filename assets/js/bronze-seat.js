import {Box3, Matrix4, Vector3} from '../vendor/three.module.js';

function quantile(values, ratio) {
  const sorted=values.slice().sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*ratio))];
}

function surface(meshes, inverse) {
  const box=new Box3(), point=new Vector3();
  const parts=[];
  for(const mesh of meshes) {
    mesh.updateWorldMatrix(true,false);
    const matrix=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    const position=mesh.geometry.getAttribute('position');
    if(!position)continue;
    const vertices=new Float64Array(position.count*3);
    for(let i=0;i<position.count;i++) {
      point.fromBufferAttribute(position,i).applyMatrix4(matrix);box.expandByPoint(point);
      vertices.set(point.toArray(),i*3);
    }
    parts.push({vertices,index:mesh.geometry.index?.array});
  }
  return {box,parts};
}

// Rasterize the actual triangle envelopes along the plug axis. The same grid
// samples both mating surfaces, including the rounded bronze rim and plate.
function envelope(parts, axis, radial, direction, grid, rear) {
  const heights=new Float64Array(grid.n*grid.n).fill(rear ? -Infinity : Infinity);
  const {n,min,step}=grid;
  for(const {vertices,index} of parts) {
    const count=index?.length ?? vertices.length/3;
    for(let i=0;i+2<count;i+=3) {
      const offsets=[0,1,2].map(k=>(index?index[i+k]:i+k)*3);
      const u=offsets.map(j=>vertices[j+radial[0]]),v=offsets.map(j=>vertices[j+radial[1]]);
      const s=offsets.map(j=>vertices[j+axis]*direction);
      const denominator=(v[1]-v[2])*(u[0]-u[2])+(u[2]-u[1])*(v[0]-v[2]);
      if(Math.abs(denominator)<1e-18)continue;
      const loU=Math.max(0,Math.ceil((Math.min(...u)-min[0])/step[0]));
      const hiU=Math.min(n-1,Math.floor((Math.max(...u)-min[0])/step[0]));
      const loV=Math.max(0,Math.ceil((Math.min(...v)-min[1])/step[1]));
      const hiV=Math.min(n-1,Math.floor((Math.max(...v)-min[1])/step[1]));
      for(let y=loV;y<=hiV;y++)for(let x=loU;x<=hiU;x++) {
        const px=min[0]+x*step[0],py=min[1]+y*step[1];
        const a=((v[1]-v[2])*(px-u[2])+(u[2]-u[1])*(py-v[2]))/denominator;
        const b=((v[2]-v[0])*(px-u[2])+(u[0]-u[2])*(py-v[2]))/denominator;
        const c=1-a-b;if(Math.min(a,b,c)<-1e-7)continue;
        const value=a*s[0]+b*s[1]+c*s[2],slot=y*n+x;
        heights[slot]=rear?Math.max(heights[slot],value):Math.min(heights[slot],value);
      }
    }
  }
  return heights;
}

export function seatBronzeMeshes(model, metals, bronzes, {apply=true,resolution=96}={}) {
  model.updateWorldMatrix(true,true);
  const inverse=new Matrix4().copy(model.matrixWorld).invert();
  const body=surface(metals,inverse);
  if(body.box.isEmpty())return [];
  const sizes=body.box.getSize(new Vector3()).toArray();
  const axis=sizes.indexOf(Math.max(...sizes)),radial=[0,1,2].filter(i=>i!==axis);
  const bodyCenter=body.box.getCenter(new Vector3()).toArray();
  const reports=[];
  for(const mesh of bronzes) {
    const ornament=surface([mesh],inverse);if(ornament.box.isEmpty())continue;
    const center=ornament.box.getCenter(new Vector3()).toArray();
    const low=ornament.box.min.toArray(),high=ornament.box.max.toArray();
    const direction=center[axis]<bodyCenter[axis]?1:-1;
    const span=radial.map(i=>high[i]-low[i]);if(span.some(x=>x<=0))continue;
    const grid={n:resolution,min:radial.map(i=>low[i]),step:span.map(x=>x/(resolution-1))};
    const back=envelope(ornament.parts,axis,radial,direction,grid,true);
    const plate=envelope(body.parts,axis,radial,direction,grid,false);
    const front=direction>0?body.box.min.toArray()[axis]:-body.box.max.toArray()[axis];
    const gaps=[];
    for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++) {
      const radius=Math.hypot((x/(resolution-1)-.5)*2,(y/(resolution-1)-.5)*2);
      const slot=y*resolution+x;
      // Exclude the fixing post and sample only the outer mating rim. Rays
      // missing the plate (holes/outside) must not attract the ornament inward.
      if(radius<.55||radius>.98||!Number.isFinite(back[slot])||!Number.isFinite(plate[slot]))continue;
      if(plate[slot]-front>sizes[axis]*.12)continue;
      gaps.push(plate[slot]-back[slot]);
    }
    if(gaps.length<16)continue;
    const tolerance=Math.max(...span)*1e-4;
    // Seat the rear supporting band, not the forward faces around the openings.
    // A small inset hides the tangent slit of the rounded edge without burying
    // the ornament in the plate (as a maximum-gap fit would do).
    const rimGap=quantile(gaps,.05)+Math.max(...span)*.01;
    const shift=rimGap>tolerance?rimGap+tolerance:0;
    if(apply&&shift>0) {
      const offset=new Vector3();offset.setComponent(axis,shift*direction);
      const world=mesh.getWorldPosition(new Vector3());
      const worldOffset=offset.applyMatrix4(model.matrixWorld).sub(new Vector3().setFromMatrixPosition(model.matrixWorld));
      mesh.position.copy(mesh.parent.worldToLocal(world.add(worldOffset)));mesh.updateWorldMatrix(true,true);
    }
    const report={method:'triangle-envelopes',axis,direction,samples:gaps.length,shift:apply?shift:0,
      rimGapBefore:rimGap,rimGapAfter:rimGap-(apply?shift:0),minGapBefore:Math.min(...gaps),maxGapBefore:Math.max(...gaps),tolerance};
    mesh.userData.bronzePlateContact=report;reports.push(report);
  }
  model.updateWorldMatrix(true,true);return reports;
}

const assert=require('node:assert/strict');
(async()=>{
  const T=await import('../assets/vendor/three.module.js');
  const {seatBronzeMeshes}=await import('../assets/js/bronze-seat.js');
  for(const size of [16,27,35,50])for(const sign of [-1,1]) {
    const model=new T.Group();
    model.rotation.set(.4,-.7,.3);model.scale.set(1.2,.8,1.1);model.position.set(12,-5,7);
    const body=new T.Mesh(new T.BoxGeometry(100,size*1.3,size*1.3));body.position.x=50*sign;model.add(body);
    const bronze=new T.Mesh(new T.SphereGeometry(size/2,64,32));bronze.scale.set(.3,1,1);bronze.position.x=-size*.8*sign;model.add(bronze);
    const original=Array.from(bronze.geometry.attributes.position.array),scale=bronze.scale.toArray();
    const result=seatBronzeMeshes(model,[body],[bronze]);
    assert.equal(result.length,1);assert.equal(result[0].direction,sign);assert(result[0].samples>16);
    assert(result[0].shift>0);assert(result[0].rimGapAfter<0);
    assert.deepEqual(Array.from(bronze.geometry.attributes.position.array),original);assert.deepEqual(bronze.scale.toArray(),scale);
    const position=bronze.position.clone();const repeated=seatBronzeMeshes(model,[body],[bronze]);
    assert.equal(repeated[0].shift,0);assert(bronze.position.distanceTo(position)<1e-9);
  }
  assert.deepEqual(seatBronzeMeshes(new T.Group(),[],[]),[]);
  console.log('Bronze contact: 8 sizes/directions, transformed parents, rigid translation, idempotence OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});

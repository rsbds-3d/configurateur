const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('C:/Users/charl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const root = path.resolve(process.argv[2] || '.');
  const bronzeType = process.argv[4] || 'keyring';
  const output = path.resolve(bronzeType === 'keyring' ? 'outputs/bronze-contact-20261104' : `outputs/bronze-contact-${bronzeType}`);
  fs.mkdirSync(output, {recursive:true});
  const types = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png'};
  const server = http.createServer((req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const file = path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
    fs.readFile(file,(error,data) => {
      if (!error && file === path.join(root,'app.js')) data = Buffer.from(data.toString()+'\nwindow.__contactTest={root,composer,camera,controls,seatBronzeAgainstPlate,THREE};');
      res.writeHead(error?404:200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
      res.end(error?'Missing':data);
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const reports=[];
    const variants=process.argv[3]?process.argv[3].split(','):['xxxl-60','small','small-18','medium','large-35','xl-35','xl-45-avec-assiette','xl','xxl-35','xxl','xxxl-70','xxxl-80','xxxl-90','xxxl-100'];
    for(const variant of variants) {
      const page=await browser.newPage({viewport:{width:1100,height:720}});page.setDefaultTimeout(120000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const params=new URLSearchParams({viewer:'1',thumbnail:'1',catalogModel:`plug-classique-${variant}-${bronzeType}`,modelFamily:'Classique',metalFamily:'inox',metalFinish:'stainless-mirror-silver',ornament:'bronze',ornamentFinish:'Gold'});
      await page.goto(`http://127.0.0.1:${server.address().port}/?${params}`);
      await page.waitForFunction(()=>document.body.dataset.viewerReady==='true' && window.__contactTest);
      const report=await page.evaluate(()=>{
        const {root,seatBronzeAgainstPlate}=window.__contactTest;
        const meshes=[];root.traverse(m=>{if(m.isMesh&&m.userData.classicPlugRole==='bronze')meshes.push(m);});
        const initial=meshes.map(m=>({...m.userData.bronzePlateContact}));
        const before=meshes.map(m=>({position:m.position.toArray(),scale:m.scale.toArray(),vertices:m.geometry.attributes.position.count}));
        const repeated=seatBronzeAgainstPlate(root);
        return {initial,repeated,before,after:meshes.map(m=>({position:m.position.toArray(),scale:m.scale.toArray(),vertices:m.geometry.attributes.position.count}))};
      });
      assert(report.initial.length>0,variant+': missing bronze');
      assert(report.initial.every(r=>r.samples>=16 && r.rimGapAfter<=r.tolerance),variant+': rim gap');
      if(bronzeType!=='keyring') assert(report.initial.every(r=>Math.abs(r.rimGapAfter)<=2*r.tolerance),variant+': bronze embedded in plate');
      assert(report.repeated.every(r=>Math.abs(r.shift)<1e-5),variant+': not idempotent');
      assert.deepEqual(report.before,report.after,variant+': repeated seating changes geometry');
      const pixels=await page.locator('#jewel-canvas').evaluate(canvas=>{
        window.__contactTest.composer.render();const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        let bright=0;for(let i=0;i<data.length;i+=16)if(data[i]>180&&data[i+1]>180&&data[i+2]>180)bright++;return bright;
      });
      assert(pixels>500,variant+': blank canvas');
      if(variant==='xl'||variant==='medium') {
        await page.evaluate(()=>{
          const {camera,controls,root,composer,THREE}=window.__contactTest;
          let bronze;root.traverse(mesh=>{if(mesh.userData.classicPlugRole==='bronze') bronze=mesh;});
          const box=new THREE.Box3().setFromObject(bronze);
          const center=box.getCenter(new THREE.Vector3());
          const direction=new THREE.Vector3(-1,0,0).transformDirection(root.matrixWorld);
          controls.target.copy(center);
          camera.position.copy(center).addScaledVector(direction,box.getSize(new THREE.Vector3()).length()*2.6);
          camera.lookAt(center);controls.update();composer.render();
        });
        await page.screenshot({path:path.join(output,`face-${variant}.png`)});
      }
      if(variant==='xxxl-60') {
        for(const [name,view] of [['perspective',[-.65,.65,1]],['profile',[0,.3,1]]]) {
          await page.evaluate(view=>{const {camera,controls,root,composer,THREE}=window.__contactTest;root.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(root);const center=box.getCenter(new THREE.Vector3());const direction=new THREE.Vector3(...view).transformDirection(root.matrixWorld);controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,box.getSize(new THREE.Vector3()).length()*1.45);camera.far=1000;camera.updateProjectionMatrix();camera.lookAt(center);controls.update();composer.render();},view);
          await page.screenshot({path:path.join(output,name+'.png')});
        }
        await page.setViewportSize({width:390,height:844});
        await page.screenshot({path:path.join(output,'mobile.png')});
      }
      assert.deepEqual(errors,[],variant+': browser errors');
      reports.push({variant,...report});console.log(variant,JSON.stringify(report.initial));await page.close();
    }
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(reports,null,2));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

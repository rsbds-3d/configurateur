const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('C:/Users/charl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const root=path.resolve(process.argv[2]||'.');
  const output=path.resolve(process.argv[3]||'outputs/new-small-20261104');fs.mkdirSync(output,{recursive:true});
  const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg'};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(error,data)=>{
      if(!error&&file===path.join(root,'app.js')) data=Buffer.from(data.toString()+'\nwindow.__modelTest={root,scaleReferenceGroup,settings,getRootGemMeshes,frameModelAndScaleReference,composer};');
      res.writeHead(error?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const reports=[];
    for(const variant of ['cabochon-lisse','cristal']) {
      const page=await browser.newPage({viewport:{width:900,height:600}});page.setDefaultTimeout(120000);
      const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.url().includes('/new-small/'))requests.push(req.url());});
      const params=new URLSearchParams({viewer:'1',thumbnail:'1',catalogModel:`plug-new-small-${variant}`,modelFamily:'NEW SMALL',plugSize:'SMALL-25',metalFamily:'inox',metalFinish:'stainless-mirror-silver',ornament:variant==='cristal'?'crystal':'gem',ornamentFinish:variant==='cristal'?'Aurore Boreale':'Green Agate'});
      await page.goto(`http://127.0.0.1:${server.address().port}/?${params}`);
      await page.waitForFunction(()=>document.body.dataset.viewerReady==='true');
      const meshes=await page.evaluate(()=>{
        const result=[];window.__modelTest.root.traverse(mesh=>{if(mesh.isMesh&&!mesh.userData.stemDecal)result.push({role:mesh.userData.classicPlugRole,vertices:mesh.geometry.attributes.position?.count,flat:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.flatShading)});});return result;
      });
      assert(meshes.some(mesh=>mesh.role==='metal'&&mesh.vertices>1000));
      assert(meshes.some(mesh=>mesh.role==='gem'));
      assert(requests.some(url=>url.includes('meshVersion=20261104-new-small-v11')));
      const image=await page.locator('#jewel-canvas').evaluate(canvas=>{window.__modelTest.composer.render();return canvas.toDataURL('image/png');});
      fs.writeFileSync(path.join(output,`plug-new-small-${variant}.png`),Buffer.from(image.split(',')[1],'base64'));
      await page.screenshot({path:path.join(output,`viewer-${variant}.png`)});
      const pixels=await page.locator('#jewel-canvas').evaluate(canvas=>{window.__modelTest.composer.render();const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;let bright=0;for(let i=0;i<data.length;i+=16)if(data[i]>180&&data[i+1]>180&&data[i+2]>180)bright++;return bright;});
      assert(pixels>500,'Blank or missing metal');
      await page.evaluate(()=>document.body.classList.remove('is-thumbnail-capture'));
      await page.locator('#scale-reference-enabled').check();
      await page.locator('#scale-reference-type').selectOption('compare');
      await page.waitForFunction(()=>{let count=0;window.__modelTest.scaleReferenceGroup.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.classicPlugRole==='metal')count++;});return count>0;});
      const comparison=await page.evaluate(()=>{let count=0;window.__modelTest.scaleReferenceGroup.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.classicPlugRole==='metal')count++;});return count;});
      assert(comparison>0);await page.screenshot({path:path.join(output,`comparison-${variant}.png`)});
      await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,`mobile-${variant}.png`)});
      assert.deepEqual(errors,[]);reports.push({variant,requests,meshes,comparison,pixels});await page.close();
    }
    fs.writeFileSync(path.join(output,'browser-check.json'),JSON.stringify(reports,null,2));console.log('NEW SMALL Chrome: both source revisions, metal/gem, nonblank canvas, comparisons, mobile OK.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
